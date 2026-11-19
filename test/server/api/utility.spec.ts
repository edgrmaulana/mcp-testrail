import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TestRailClient } from "../../../src/client/api/index.js";
import { registerAllTools } from "../../../src/server/api/index.js";

// The stats read process counters, so no network is involved: the unroutable
// host proves the tool answers without touching TestRail.
describe("getRateLimitStats", () => {
	it("reports the process throttle counters", async () => {
		const server = new McpServer({ name: "spec", version: "1.0.0" });
		registerAllTools(
			server,
			new TestRailClient({
				baseURL: "http://127.0.0.1:9/index.php?/",
				auth: { username: "u", password: "k" },
			}),
		);
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		await server.connect(serverSide);
		const client = new Client({ name: "spec", version: "1.0.0" });
		await client.connect(clientSide);
		try {
			const result = await client.callTool({
				name: "getRateLimitStats",
				arguments: {},
			});
			expect(result.isError).toBeFalsy();
			const text = (result.content as [{ text: string }])[0].text;
			const stats = JSON.parse(text).stats;
			expect(typeof stats.throttledRequests).toBe("number");
			expect(typeof stats.totalThrottleDelayMs).toBe("number");
		} finally {
			await client.close();
			await server.close();
		}
	});
});
