import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { TestRailClient } from "../../../src/client/api/index.js";

vi.mock("axios");

// TestRail's route lives inside the query string (index.php?/api/v2/...), so a
// hand-written "?" in an endpoint ends up a literal character there and
// TestRail rejects the request with "Invalid characters in URI". Query
// parameters have to go through axios, which picks "&" or "?" to match the
// configured baseURL.
describe("endpoint URIs", () => {
	let client: TestRailClient;
	let post: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		post = vi.fn().mockResolvedValue({ data: {} });
		vi.mocked(axios.create).mockReturnValue({
			post,
			get: vi.fn().mockResolvedValue({ data: {} }),
			put: vi.fn().mockResolvedValue({ data: {} }),
			delete: vi.fn().mockResolvedValue({ data: {} }),
			defaults: { headers: { common: {} } },
			interceptors: {
				request: { use: vi.fn() },
				response: { use: vi.fn() },
			},
			// biome-ignore lint/suspicious/noExplicitAny: partial axios instance
		} as any);

		client = new TestRailClient({
			baseURL: "https://example.testrail.com/index.php?/",
			auth: { username: "u", password: "k" },
		});
	});

	it("never hand-writes a query parameter into an endpoint", async () => {
		await client.cases.updateCases(1, 900, { title: "x" }, [1, 2]);
		await client.cases.deleteCases(1, 900, [1, 2]);
		await client.sections.deleteSection(74807, true);
		await client.sections.deleteSection(74807);

		const urls = post.mock.calls.map((call) => call[0] as string);
		expect(urls.length).toBe(4);
		for (const url of urls) {
			expect(url).not.toContain("?");
			expect(url).not.toContain("&");
		}
	});

	it("builds update_cases with the suite id in the path", async () => {
		// TestRail takes suite_id in the path for this endpoint, not project_id,
		// and update_cases does not accept project_id at all.
		await client.cases.updateCases(47, 900, { title: "x" }, [1, 2]);

		expect(post).toHaveBeenCalledWith("/api/v2/update_cases/900", {
			title: "x",
			case_ids: [1, 2],
		});
	});

	it("builds delete_cases with the suite id in the path and project_id in the body", async () => {
		// Unlike update_cases, delete_cases requires project_id as a body field.
		await client.cases.deleteCases(47, 900, [1, 2]);

		expect(post).toHaveBeenCalledWith("/api/v2/delete_cases/900", {
			project_id: 47,
			case_ids: [1, 2],
		});
	});

	it("passes the soft delete flag to axios rather than the URL", async () => {
		await client.sections.deleteSection(74807, true);

		expect(post).toHaveBeenCalledWith(
			"/api/v2/delete_section/74807",
			{},
			{ params: { soft: 1 } },
		);
	});

	it("sends no parameter at all for a hard delete", async () => {
		await client.sections.deleteSection(74807);

		expect(post).toHaveBeenCalledWith(
			"/api/v2/delete_section/74807",
			{},
			undefined,
		);
	});
});
