import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape, type ZodObject } from "zod";
import { BaseTestRailClient } from "../../client/api/baseClient.js";

// Function to format error messages
export function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// Trimming here would corrupt structured payloads (nothing says which key
// is safe to cut), so oversized responses keep their data and gain a hint
// pointing at the shrinking tools instead. 32KB matches the plan's cap.
// shortcut: hint only, never truncation; revisit if a host starts cutting
// responses the hint was supposed to prevent.
const RESPONSE_SIZE_HINT_BYTES = 32 * 1024;

// Function to create success response
export function createSuccessResponse(
	message: string,
	data?: Record<string, unknown>,
): CallToolResult {
	const text = JSON.stringify(
		{
			message,
			...(data || {}),
		},
		null,
		2,
	);
	return {
		content: [
			{
				type: "text",
				text:
					text.length > RESPONSE_SIZE_HINT_BYTES
						? JSON.stringify({
								message,
								...(data || {}),
								_sizeHint: `Response is ~${Math.round(text.length / 1024)}KB; use fields, namesOnly, limit/offset, or getAttachmentsForCase pagination to shrink it.`,
							})
						: text,
			},
		],
	};
}

// Function to create error response
export function createErrorResponse(
	baseMessage: string,
	error: unknown,
): CallToolResult {
	const errorMessage = formatErrorMessage(error);
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						error: `${baseMessage}: ${errorMessage}`,
					},
					null,
					2,
				),
			},
		],
		isError: true,
	};
}

// Paginates an in-memory list for endpoints TestRail itself does not page
// (get_projects, get_suites, get_case_types, get_case_fields return all
// rows). Same envelope as createPagination so callers page every list tool
// the same way; an omitted limit returns everything with hasMore: false.
// @param items The full list returned by the API
// @param limit Maximum entries to return
// @param offset Entries to skip
// @returns The page plus its pagination envelope
// ponytail: slice, not a cursor. Counts are exact because the whole list is
// in hand; upgrade if any of these endpoints ever grows past memory comfort.
export function paginateArray<T>(
	items: T[],
	limit?: number,
	offset?: number,
): {
	page: T[];
	pagination: {
		limit: number;
		offset: number;
		count: number;
		hasMore: boolean;
	};
} {
	const start = offset ?? 0;
	const perPage = limit ?? items.length;
	const page = items.slice(start, start + perPage);
	const pagination = createPagination({
		limit: perPage,
		offset: start,
		size: page.length,
	});
	return {
		page,
		// Without an explicit limit the page is the whole remainder, so
		// there is nothing more even when the page fills perPage exactly.
		pagination:
			limit === undefined ? { ...pagination, hasMore: false } : pagination,
	};
}

// Single pagination shape for every paginated TestRail endpoint.
// TestRail's `size` is the number of entries on this page, not a grand total,
// so it is reported as `count`; there is no total available from the API.
export function createPagination(result: {
	limit: number;
	offset: number;
	size: number;
	_links?: { next: string | null; prev: string | null };
}): {
	limit: number;
	offset: number;
	count: number;
	hasMore: boolean;
} {
	return {
		limit: result.limit,
		offset: result.offset,
		count: result.size,
		// `_links` requires TestRail 6.7+ and can be stripped by a proxy. Without
		// it, assume a full page means more to come: one extra empty request beats
		// silently truncating the caller's data.
		hasMore: result._links
			? Boolean(result._links.next)
			: result.size >= result.limit,
	};
}

// Every tool advertises `additionalProperties: false`, but a tool registered
// from a plain shape silently strips unknown keys instead of refusing them, so
// a misspelled parameter is dropped and the call still reports success. A
// strict schema refuses it and names the key. McpServer.tool() only takes a
// raw shape, which cannot carry strictness, so registration goes through
// registerTool - which is what the SDK now recommends anyway, as tool() is
// deprecated.
/**
 * Registers cross-cutting tools that belong to no single resource. Stats are
 * process-wide (every sub-client retries through one interceptor), so one
 * server process reports one true total.
 * @param server McpServer instance
 */
export function registerUtilityTools(server: McpServer): void {
	registerStrictTool(
		server,
		"getRateLimitStats",
		"Reports how many TestRail requests were throttled by the 429 rate limiter in this server process and how long the retries waited. Use to tell a slow bulk sweep apart from a throttled one.",
		{},
		async () =>
			createSuccessResponse("Rate limit stats retrieved successfully", {
				stats: BaseTestRailClient.getThrottleStats(),
			}),
	);
}

export function registerStrictTool<Shape extends ZodRawShape>(
	server: McpServer,
	name: string,
	description: string,
	shape: Shape,
	handler: (
		args: z.infer<ZodObject<Shape, "strict">>,
		extra: unknown,
	) => Promise<CallToolResult>,
): void {
	server.registerTool(
		name,
		{ description, inputSchema: z.object(shape).strict() },
		handler as never,
	);
}
