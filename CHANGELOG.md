# Changelog

Notable changes to `@edgrmaulana/mcp-testrail`. Releases before 0.23.0 are
listed at [Releases](https://github.com/edgrmaulana/mcp-testrail/releases).

## 0.24.0 (unreleased)

### Breaking changes

**Unknown tool parameters are now refused instead of silently dropped**
([#12](https://github.com/edgrmaulana/mcp-testrail/issues/12))

Every tool already advertised `additionalProperties: false`, but tools were
registered from plain shapes, which strip unknown keys rather than rejecting
them. A misspelled parameter was discarded and the call still reported
success — on a write tool, silent data loss.

The trigger was a naming mismatch: the prerequisites field is exposed as
`customPrerequisites`, while TestRail and `getCase` both call it
`custom_preconds`. So this looked like it worked:

```json
{ "caseId": 534442, "customPreconds": "...new text..." }
```

It returned `Test case updated successfully` and changed nothing.

Now:

```
Input validation error: Invalid arguments for tool updateCase:
Unrecognized key(s) in object: 'customPreconds'
```

This applies to all 42 tools, reads included — a miscased `sectionid` on
`getCases` used to return unfiltered results, which is just as easy to act on
wrongly as a failed write. **Any caller passing a parameter the tool does not
declare will now get an error where it previously got a success.** That is the
point of the change, but it can surface callers that were quietly broken.

To set a custom field the tools do not name individually, use `customFields`,
which passes raw TestRail field names through:

```json
{ "caseId": 534442, "customFields": { "custom_preconds": "...new text..." } }
```

Array items are strict too. `addResultsForCases` is where this mattered most:
a single typo in a batch — `commnet` for `comment` — was dropped for every
result while the call still reported success. `addPlan`'s `entries[]` had an
extra trap, since those keys are snake_case (`include_all`, `case_ids`) while
every top-level parameter is camelCase, so the natural camelCase guess was
silently discarded and the entry created with the wrong scope.

`runs` inside a plan entry stays open (`z.record`), as a deliberate
passthrough for TestRail's run configuration.

### Changed

Tools are registered through `McpServer.registerTool` rather than
`McpServer.tool`, because only the former accepts a schema that can carry
strictness. The SDK deprecated `tool()` in favour of `registerTool()` anyway.
Tool names, descriptions and input shapes are unchanged.

## 0.23.1 - 2026-10-02

### Fixed

**`deleteSection` with `soft: true` destroyed the section instead of previewing
it** ([#10](https://github.com/edgrmaulana/mcp-testrail/issues/10))

TestRail reads `soft` from the POST body. 0.23.0 sent it as a query parameter,
where TestRail ignores it and performs a real deletion — so a caller asking
what a deletion *would* affect had the section and its test cases destroyed.
That is worse than the behaviour 0.23.0 replaced, where the call failed and
nothing was lost.

Verified against a live instance:

| sent | response | section |
| --- | --- | --- |
| `&soft=1` in the query (0.23.0) | empty | **destroyed** |
| `{"soft": 1}` in the body (0.23.1) | `{"cases": 0}` | survives |
| hard delete | empty | destroyed |

A preview now reports what it is and carries TestRail's counts:

```json
{ "message": "Section 1089290 was previewed, not deleted", "affected": { "cases": 0 } }
```

If a preview was requested and TestRail answers without a dry-run payload, the
tool now returns an error saying the section may have been deleted, rather than
reporting success. Anything that is not a JSON object — an empty body, or a
login or maintenance page served with a 200 — is treated as no payload.

### Changed

**`deleteSection` returns the response payload** instead of `void`. Breaking
for direct consumers of the exported client; the MCP tool result is unaffected
apart from the new `affected` field.

The `deleteSection` tool description now states that the deletion is
irreversible and cascades to the section's test cases, and what `soft` does.

## 0.23.0 - 2026-10-02

Four long-standing bugs in how the server talks to TestRail and to its own
clients. Three of the fixes change the response shape, so read **Breaking
changes** before upgrading.

### Breaking changes

**1. Tool results are no longer double-encoded** ([#4](https://github.com/edgrmaulana/mcp-testrail/issues/4))

Every result used to arrive as JSON nested inside a JSON string, so consumers
parsed twice:

```python
outer = json.loads(raw)
data  = json.loads(outer["text"])   # the actual payload
```

The payload is now readable in one pass. **Delete the second parse** — it will
raise `SyntaxError` against the new shape.

```python
data = json.loads(raw)   # data["case"], data["cases"], ...
```

Results that a client spills to a file inherit the same change.

**2. `pagination.total` is now `pagination.count`**

`getCases` reported `total: size`, but TestRail's `size` is the number of
entries on the *current page* — the API exposes no grand total. A loop written
as `while offset < total` stopped after page one. The field is now named for
what it is. Drive pagination off `hasMore` instead:

```
pagination: { limit, offset, count, hasMore }
```

**3. `getSections` returns a `pagination` object**

Its flat `offset`, `limit`, `size` and `_links` fields move into the same
`pagination` shape above. `_links` is no longer returned; use
`pagination.hasMore`.

**4. `getTests` returns a flat array**

`tests` used to hold TestRail's raw envelope nested under its own key:

```json
{ "tests": { "tests": [...], "offset": 0, "limit": 50, "size": 50, "_links": {} } }
```

It is now the array itself, with the same `pagination` object alongside:

```json
{ "tests": [...], "pagination": { "limit": 50, "offset": 0, "count": 50, "hasMore": true } }
```

Pagination is now identical across `getCases`, `getSections` and `getTests`,
which previously returned three different shapes.

### Added

**`getCases` returns the project's custom fields**
([#2](https://github.com/edgrmaulana/mcp-testrail/issues/2))

Custom field values were dropped from list responses, so auditing a required
field across a suite cost one `getCase` per case — 120 calls for one suite,
against a 180/minute limit. Scalar `custom_*` fields now come back by default.

Large bodies are still kept out: `custom_preconds`, `custom_steps`,
`custom_expected`, `custom_steps_separated` and `custom_testrail_bdd_scenario`
are excluded by name, and any other custom string over 250 characters is
truncated with `...[truncated, use getCase for the full value]`. Truncating
rather than dropping keeps "this field is set" readable, since an absent key
cannot be told apart from an unset required field.

**Rate-limited requests are retried**
([#3](https://github.com/edgrmaulana/mcp-testrail/issues/3))

A TestRail 429 used to surface as a plain error, so any job touching more than
~180 cases in a minute failed partway through. Requests are now retried using
the delay the response reports: the `Retry-After` header, else the delay stated
in the error body (`"Retry after 6 seconds."`), else exponential backoff with
jitter.

Writes are retried too — a 429 means TestRail rejected the request outright, so
nothing was half-applied. Attempts default to 3; once exhausted, TestRail's own
error comes through untouched.

**`TESTRAIL_MAX_RETRIES`** (optional)

How many times a 429 is retried. Defaults to `3`; `0` disables retrying. Must
be a non-negative integer or the server refuses to start.

```json
"env": {
  "TESTRAIL_URL": "https://your-instance.testrail.io",
  "TESTRAIL_USERNAME": "you@example.com",
  "TESTRAIL_API_KEY": "YOUR_API_KEY",
  "TESTRAIL_MAX_RETRIES": "3"
}
```

**`getTests` honours `limit` and `offset`**

Both were advertised with defaults and then silently dropped, so every call
returned the first 50 tests regardless.

### Fixed

**`updateCases` and soft `deleteSection` reached TestRail at all**
([#1](https://github.com/edgrmaulana/mcp-testrail/issues/1))

Both failed with `Invalid characters in URI`. TestRail's route lives inside the
query string (`index.php?/api/v2/...`), so the hand-written `?` in these
endpoints corrupted the route. Query parameters now go through axios, which
picks `&` or `?` to match the configured base URL.

For `deleteSection` this fixed the URI but not the behaviour: TestRail ignores
`soft` as a query parameter and deletes the section for real. See 0.23.1 below
— **do not use `soft: true` on 0.23.0.**

`update_cases` and `delete_cases` also used the wrong path parameter — TestRail
takes the suite id there, not the project id — and `delete_cases` now sends
`project_id` in the body, where TestRail requires it. (`delete_cases` has no
MCP tool, so it was only reachable from the exported client.)

Three test assertions encoded the broken URLs, which is why the suite stayed
green. A regression test now asserts that no endpoint hand-writes a query
parameter.

**A blank `Retry-After` is no longer read as "no wait"**

`Number("")` is `0` and finite, so an empty or negative header would have
retried three times with no delay at all and discarded the delay stated in the
error body. Such a header is now treated as absent; an explicit `0` still means
retry immediately.

**`getCases` no longer crashes on TestRail older than 6.7**

It dereferenced `_links.next` unguarded. When `_links` is absent, a full page is
now treated as "maybe more" rather than silently ending pagination.

### Removed

- `BaseTestRailClient.request()`, which nothing called. Its `429` branch would
  have replaced TestRail's `"Retry after 6 seconds"` with a bare
  `"Rate limit exceeded"`, discarding the delay.
- `TestRailError`, `TestRailAPIError`, `TestRailTimeoutError` and
  `TestRailNetworkError`, which that method was the only producer of. They were
  not re-exported from the package entry point, so an
  `instanceof TestRailAPIError` check could never have matched.
- An unused `availableColumns` list in the case tools, computed from the case
  schema and never referenced — the remains of a `columns` parameter that was
  never wired up.

### Tool descriptions

`getCases`, `getSections` and `getTests` now document their `pagination` object
and how to page through it, and `getCases` states that custom fields are
included and which values are excluded or truncated. These are what an MCP
client reads to decide how to call a tool, so the wording is part of the fix.

### Known limitations

- **`addBdd` is not retried on a 429.** It posts `form-data`, a stream the first
  attempt consumes, so re-sending the request would hang rather than retry. It
  reports the rate limit immediately instead; the caller still has the feature
  content and can call again.
- **A suggested wait over 60 seconds gives up** rather than blocking the tool
  call. Blocking for minutes is worse than reporting the limit.
- **`updateCases` still takes a `projectId` it ignores.** TestRail's
  `update_cases` has no `project_id`, so a `projectId`/`suiteId` mismatch is
  accepted and applies to whichever project owns the suite. Removing the
  parameter would break the tool schema and the exported client signature.
- **No client-side throttle.** Retrying handles the symptom; staying under the
  limit pre-emptively would need the per-plan ceiling configured (180/minute on
  Professional, 300 on Enterprise, unlimited on TestRail Server).
