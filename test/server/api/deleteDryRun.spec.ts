import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { setupMocks, createTestClient } from "../../client/api/testHelper.js";
import { registerAllTools } from "../../../src/server/api/index.js";

vi.mock("axios");

// Unlike dryRun.spec.ts (which proves previews never touch the network), the
// delete previews read the target first to echo its title, so they need a
// mocked network. These assert the read happens and no write follows.
async function callTool(
	mockGet: (url: string) => Promise<{ data: unknown }>,
	mockPost: ReturnType<typeof vi.fn>,
	tool: string,
	args: Record<string, unknown>,
) {
	const mockAxiosInstance = setupMocks();
	mockAxiosInstance.get.mockImplementation(mockGet);
	mockAxiosInstance.post.mockImplementation(mockPost);
	const server = new McpServer({ name: "spec", version: "1.0.0" });
	registerAllTools(server, createTestClient());
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await server.connect(serverSide);
	const client = new Client({ name: "spec", version: "1.0.0" });
	await client.connect(clientSide);
	try {
		const result = await client.callTool({ name: tool, arguments: args });
		expect(result.isError).toBeFalsy();
		const text = (result.content as [{ text: string }])[0].text;
		return { payload: JSON.parse(text), post: mockPost };
	} finally {
		await client.close();
		await server.close();
	}
}

describe("delete dryRun previews", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("previews a case deletion with its title and posts nothing", async () => {
		const post = vi.fn();
		const { payload } = await callTool(
			(url) =>
				url === "/api/v2/get_case/9"
					? Promise.resolve({ data: { id: 9, title: "Old case" } })
					: Promise.reject(new Error(`unexpected GET ${url}`)),
			post,
			"deleteCase",
			{ caseId: 9, dryRun: true },
		);

		expect(payload.case).toEqual({ id: 9, title: "Old case" });
		expect(payload.message).toMatch(/dry run/i);
		expect(post).not.toHaveBeenCalled();
	});

	it("previews a section deletion with its cases and posts nothing", async () => {
		const post = vi.fn();
		const { payload } = await callTool(
			(url) => {
				if (url === "/api/v2/get_section/4")
					return Promise.resolve({
						data: { id: 4, name: "Old section", suite_id: 2 },
					});
				if (url === "/api/v2/get_suite/2")
					return Promise.resolve({
						data: { id: 2, name: "Suite", project_id: 5 },
					});
				if (url === "/api/v2/get_cases/5")
					return Promise.resolve({
						data: {
							cases: [{ id: 9, title: "Old case" }],
							offset: 0,
							limit: 51,
							size: 1,
							_links: { next: null, prev: null },
						},
					});
				return Promise.reject(new Error(`unexpected GET ${url}`));
			},
			post,
			"deleteSection",
			{ sectionId: 4, dryRun: true },
		);

		expect(payload.section).toEqual({ id: 4, name: "Old section" });
		expect(payload.cases).toEqual([{ id: 9, title: "Old case" }]);
		expect(payload.message).toMatch(/dry run/i);
		expect(post).not.toHaveBeenCalled();
	});

	it("previews a run deletion with its name and posts nothing", async () => {
		const post = vi.fn();
		const { payload } = await callTool(
			(url) =>
				url === "/api/v2/get_run/3"
					? Promise.resolve({ data: { id: 3, name: "Nightly" } })
					: Promise.reject(new Error(`unexpected GET ${url}`)),
			post,
			"deleteRun",
			{ runId: 3, dryRun: true },
		);

		expect(payload.run).toEqual({ id: 3, name: "Nightly" });
		expect(payload.message).toMatch(/dry run/i);
		expect(post).not.toHaveBeenCalled();
	});
});
