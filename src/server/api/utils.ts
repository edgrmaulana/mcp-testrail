import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Function to format error messages
export function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// Function to create success response
export function createSuccessResponse(
	message: string,
	data?: Record<string, unknown>,
): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						message,
						...(data || {}),
					},
					null,
					2,
				),
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
