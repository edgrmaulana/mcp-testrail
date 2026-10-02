import { describe, it, expect } from "vitest";
import {
	createSuccessResponse,
	createErrorResponse,
	createPagination,
} from "../../../src/server/api/utils.js";

describe("server response helpers", () => {
	it("returns a payload that is readable in a single parse", () => {
		const res = createSuccessResponse("Test case retrieved successfully", {
			case: { id: 1, title: "Login" },
		});

		expect(res.content).toHaveLength(1);
		const text = (res.content as [{ type: string; text: string }])[0].text;
		const payload = JSON.parse(text);

		expect(payload).toEqual({
			message: "Test case retrieved successfully",
			case: { id: 1, title: "Login" },
		});
		// The old bug: text was itself a {type,text} envelope needing a second parse.
		expect(payload).not.toHaveProperty("type");
		expect(payload).not.toHaveProperty("text");
	});

	it("flags errors with isError and a single-parse message", () => {
		const res = createErrorResponse(
			"Error fetching test case 1",
			new Error("boom"),
		);

		expect(res.isError).toBe(true);
		const text = (res.content as [{ type: string; text: string }])[0].text;
		expect(JSON.parse(text)).toEqual({
			error: "Error fetching test case 1: boom",
		});
	});
});

describe("createPagination", () => {
	it("reports size as a page count, not a total", () => {
		expect(
			createPagination({
				limit: 50,
				offset: 0,
				size: 50,
				_links: { next: "/api/v2/get_cases/1&offset=50", prev: null },
			}),
		).toEqual({ limit: 50, offset: 0, count: 50, hasMore: true });
	});

	it("has no more pages when next is null", () => {
		expect(
			createPagination({
				limit: 50,
				offset: 100,
				size: 20,
				_links: { next: null, prev: "/api/v2/get_cases/1&offset=50" },
			}).hasMore,
		).toBe(false);
	});

	it("has no more pages when the API omits _links and the page is short", () => {
		expect(createPagination({ limit: 50, offset: 0, size: 3 }).hasMore).toBe(
			false,
		);
	});

	it("keeps paging when the API omits _links and the page is full", () => {
		// TestRail < 6.7, or a proxy that strips _links: a full page has to be
		// treated as "maybe more" or the caller truncates silently.
		expect(createPagination({ limit: 50, offset: 0, size: 50 }).hasMore).toBe(
			true,
		);
	});
});
