import { describe, it, expect } from "vitest";
import {
	createSuccessResponse,
	createErrorResponse,
	createPagination,
	paginateArray,
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

	it("adds a shrinking hint to oversized responses without touching data", () => {
		const big = "x".repeat(40 * 1024);
		const res = createSuccessResponse("Big", { big });
		const text = (res.content as [{ text: string }])[0].text;
		const payload = JSON.parse(text);

		expect(payload.big).toBe(big);
		expect(payload._sizeHint).toMatch(/fields/);
		expect(payload.truncated).toBe(true);
	});

	it("leaves small responses alone", () => {
		const res = createSuccessResponse("Small", { id: 1 });
		const text = (res.content as [{ text: string }])[0].text;

		expect(JSON.parse(text)).not.toHaveProperty("_sizeHint");
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

describe("paginateArray", () => {
	const rows = [1, 2, 3, 4, 5];

	it("returns everything when no limit is given", () => {
		expect(paginateArray(rows)).toEqual({
			page: [1, 2, 3, 4, 5],
			pagination: { limit: 5, offset: 0, count: 5, hasMore: false },
		});
	});

	it("slices a middle page and reports more to come", () => {
		expect(paginateArray(rows, 2, 2)).toEqual({
			page: [3, 4],
			pagination: { limit: 2, offset: 2, count: 2, hasMore: true },
		});
	});

	it("reports the end of the list on a short final page", () => {
		expect(paginateArray(rows, 2, 4)).toEqual({
			page: [5],
			pagination: { limit: 2, offset: 4, count: 1, hasMore: false },
		});
	});
});
