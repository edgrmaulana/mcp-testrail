import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { TestRailClient } from "../../../src/client/api/index.js";
import { registerAllTools } from "../../../src/server/api/index.js";
import { registerStrictTool } from "../../../src/server/api/utils.js";

// Tools advertise `additionalProperties: false`, but a tool registered from a
// plain shape strips unknown keys instead of refusing them: a misspelled
// parameter is dropped and the call still reports success, which on a write
// tool means silent data loss. These tests pin the refusal.
async function connect(server: McpServer) {
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await server.connect(serverSide);
	const client = new Client({ name: "spec", version: "1.0.0" });
	await client.connect(clientSide);
	return client;
}

describe("registerStrictTool", () => {
	it("refuses an unknown key and names it", async () => {
		const server = new McpServer({ name: "spec", version: "1.0.0" });
		registerStrictTool(
			server,
			"probe",
			"A tool with one known parameter",
			{ known: z.string().optional() },
			async () => ({ content: [{ type: "text", text: "ran" }] }),
		);
		const client = await connect(server);

		const result = await client.callTool({
			name: "probe",
			arguments: { known: "yes", bogusParam: "dropped?" },
		});

		expect(result.isError).toBe(true);
		const text = (result.content as [{ text: string }])[0].text;
		expect(text).toContain("bogusParam");
	});

	it("still runs when every key is known", async () => {
		const server = new McpServer({ name: "spec", version: "1.0.0" });
		registerStrictTool(
			server,
			"probe",
			"A tool with one known parameter",
			{ known: z.string().optional() },
			async (args) => ({
				content: [{ type: "text", text: JSON.stringify(args) }],
			}),
		);
		const client = await connect(server);

		const result = await client.callTool({
			name: "probe",
			arguments: { known: "yes" },
		});

		expect(result.isError).toBeFalsy();
		const text = (result.content as [{ text: string }])[0].text;
		expect(JSON.parse(text)).toEqual({ known: "yes" });
	});
});

describe("every registered tool", () => {
	let client: Client;

	beforeAll(async () => {
		const server = new McpServer({ name: "spec", version: "1.0.0" });
		// Nothing here reaches the network: input validation runs before the
		// handler, so an unroutable host is enough.
		registerAllTools(
			server,
			new TestRailClient({
				baseURL: "http://127.0.0.1:9/index.php?/",
				auth: { username: "u", password: "k" },
			}),
		);
		client = await connect(server);
	});

	afterAll(async () => {
		await client?.close();
	});

	it("refuses an unknown parameter, every single one of them", async () => {
		// Checking the advertised schema would prove nothing: zod-to-json-schema
		// emits `additionalProperties: false` for strip-mode objects too, so
		// that assertion passed before any of this was strict. Only calling each
		// tool shows whether it actually refuses. Zod reports the unrecognized
		// key alongside the missing required ones, so no per-tool fixtures are
		// needed.
		const { tools } = await client.listTools();
		expect(tools.length).toBeGreaterThan(0);

		const accepted: string[] = [];
		for (const tool of tools) {
			const result = await client.callTool({
				name: tool.name,
				arguments: { bogusParam: "should be refused" },
			});
			const text = (result.content as [{ text: string }])[0].text;
			if (!result.isError || !text.includes("bogusParam")) {
				accepted.push(tool.name);
			}
		}

		expect(accepted).toEqual([]);
	});

	it("keeps a usable description", async () => {
		const { tools } = await client.listTools();

		for (const tool of tools) {
			expect((tool.description ?? "").length).toBeGreaterThan(10);
		}
	});

	it("refuses the misspelling from issue #12 instead of dropping it", async () => {
		// TestRail and getCase both call this field custom_preconds, so
		// customPreconds is the natural guess; the tool exposes it as
		// customPrerequisites. It used to be accepted, dropped, and reported
		// as a success.
		const result = await client.callTool({
			name: "updateCase",
			arguments: { caseId: 534442, customPreconds: "new text" },
		});

		expect(result.isError).toBe(true);
		const text = (result.content as [{ text: string }])[0].text;
		expect(text).toContain("customPreconds");
	});

	it("refuses a miscased parameter on a read tool too", async () => {
		const result = await client.callTool({
			name: "getCases",
			arguments: { projectId: 47, suiteId: 900, sectionid: 1 },
		});

		expect(result.isError).toBe(true);
		const text = (result.content as [{ text: string }])[0].text;
		expect(text).toContain("sectionid");
	});

	it("refuses an unknown key inside a bulk result item", async () => {
		// Top-level strictness does not reach array items, and this is the tool
		// where a dropped field costs most: one typo in a batch of results loses
		// that field for every case while still reporting success.
		const result = await client.callTool({
			name: "addResultsForCases",
			arguments: {
				runId: 1,
				results: [{ caseId: 2, statusId: 1, commnet: "typo" }],
			},
		});

		expect(result.isError).toBe(true);
		const text = (result.content as [{ text: string }])[0].text;
		expect(text).toContain("commnet");
	});

	it("refuses camelCase guesses inside a plan entry", async () => {
		// addPlan's entries[] use snake_case while every top-level parameter is
		// camelCase, so camelCase is the natural guess. It used to be dropped,
		// creating the entry with the wrong scope.
		const result = await client.callTool({
			name: "addPlan",
			arguments: {
				projectId: 47,
				name: "Plan",
				entries: [{ suite_id: 900, includeAll: true, caseIds: [1, 2] }],
			},
		});

		expect(result.isError).toBe(true);
		const text = (result.content as [{ text: string }])[0].text;
		expect(text).toContain("includeAll");
	});
});
