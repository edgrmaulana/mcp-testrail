# Changelog

Notable changes to `@edgrmaulana/mcp-testrail`. Releases before 0.23.0 are
listed at [Releases](https://github.com/edgrmaulana/mcp-testrail/releases).

## 0.23.0 (unreleased)

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
