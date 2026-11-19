import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { setupMocks, createTestClient } from "../../client/api/testHelper.js";
import { registerAllTools } from "../../../src/server/api/index.js";

vi.mock("axios");

// Every list tool pages the same way; this pins the contract for the
// newest one. Mocked network, so the tool exercises the real slicing.
async function callTool(args: Record<string, unknown>) {
	const mockAxiosInstance = setupMocks();
	mockAxiosInstance.get.mockImplementation((url: string) => {
		if (url === "/api/v2/get_configs/24") {
			return Promise.resolve({
				data: [
					{ id: 1, name: "OS", project_id: 24, configs: [] },
					{ id: 2, name: "Browser", project_id: 24, configs: [] },
					{ id: 3, name: "Env", project_id: 24, configs: [] },
				],
			});
		}
		return Promise.reject(new Error(`unexpected GET ${url}`));
	});
	const server = new McpServer({ name: "spec", version: "1.0.0" });
	registerAllTools(server, createTestClient());
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await server.connect(serverSide);
	const client = new Client({ name: "spec", version: "1.0.0" });
	await client.connect(clientSide);
	try {
		const result = await client.callTool({
			name: "getConfigurations",
			arguments: args,
		});
		expect(result.isError).toBeFalsy();
		const text = (result.content as [{ text: string }])[0].text;
		return JSON.parse(text);
	} finally {
		await client.close();
		await server.close();
	}
}

describe("getConfigurations pagination", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("pages with the uniform envelope", async () => {
		const first = await callTool({ projectId: 24, limit: 2 });
		expect(first.configurations).toHaveLength(2);
		expect(first.pagination).toMatchObject({
			limit: 2,
			offset: 0,
			count: 2,
			hasMore: true,
		});

		const second = await callTool({ projectId: 24, limit: 2, offset: 2 });
		expect(second.configurations).toHaveLength(1);
		expect(second.pagination.hasMore).toBe(false);
	});

	it("returns everything when no limit is given", async () => {
		const all = await callTool({ projectId: 24 });
		expect(all.configurations).toHaveLength(3);
		expect(all.pagination.hasMore).toBe(false);
	});
});
