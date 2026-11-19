import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TestRailClient } from "../../../src/client/api/index.js";
import { registerAllTools } from "../../../src/server/api/index.js";

// A dry run must never reach the network: the client points at an unroutable
// host, so any GET or POST fails the tool. Success proves the preview path
// short-circuits before TestRail is touched.
async function callDryRun(tool: string, args: Record<string, unknown>) {
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
			name: tool,
			arguments: { ...args, dryRun: true },
		});
		expect(result.isError).toBeFalsy();
		const text = (result.content as [{ text: string }])[0].text;
		return JSON.parse(text);
	} finally {
		await client.close();
		await server.close();
	}
}

describe("dryRun previews", () => {
	it("previews a case move without moving anything", async () => {
		expect(
			await callDryRun("moveToSection", { caseIds: [1, 2], sectionId: 5 }),
		).toMatchObject({ caseIds: [1, 2], sectionId: 5, count: 2 });
	});

	it("previews a case copy without copying anything", async () => {
		expect(
			await callDryRun("copyToSection", { caseIds: [3], sectionId: 5 }),
		).toMatchObject({ caseIds: [3], sectionId: 5, count: 1 });
	});

	it("previews a bulk update with the payload that would be sent", async () => {
		expect(
			await callDryRun("updateCases", {
				suiteId: 9,
				caseIds: [1, 2],
				title: "New title",
			}),
		).toMatchObject({
			caseIds: [1, 2],
			count: 2,
			payload: { title: "New title" },
		});
	});

	it("previews bulk results without adding anything", async () => {
		expect(
			await callDryRun("addResultsForCases", {
				runId: 7,
				results: [{ caseId: 2, statusId: 1 }],
			}),
		).toMatchObject({ runId: 7, count: 1, caseIds: [2] });
	});

	it("previews a section move without moving anything", async () => {
		const payload = await callDryRun("moveSection", {
			sectionId: 4,
			parentId: 9,
		});
		expect(payload.sectionId).toBe(4);
		expect(payload.message).toMatch(/dry run/i);
	});
});
