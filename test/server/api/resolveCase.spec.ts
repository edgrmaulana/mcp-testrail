import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { setupMocks, createTestClient } from "../../client/api/testHelper.js";
import { registerCaseTools } from "../../../src/server/api/cases.js";

vi.mock("axios");

// Nothing here reaches the network: axios is mocked, so the tool exercises
// the real fan-out and fallback logic against canned responses.
async function callResolveCase(
	mockGet: (url: string) => Promise<{ data: unknown }>,
	caseId: number,
) {
	const mockAxiosInstance = setupMocks();
	mockAxiosInstance.get.mockImplementation((url: string) => mockGet(url));
	const server = new McpServer({ name: "spec", version: "1.0.0" });
	registerCaseTools(server, createTestClient());
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await server.connect(serverSide);
	const client = new Client({ name: "spec", version: "1.0.0" });
	await client.connect(clientSide);
	try {
		return await client.callTool({
			name: "resolveCase",
			arguments: { caseId },
		});
	} finally {
		await client.close();
		await server.close();
	}
}

const testCase = {
	id: 37747,
	title: "Starter registration auto-approve",
	suite_id: 113,
	section_id: 7357,
	template_id: 4,
	type_id: 9,
	priority_id: 2,
	status_id: 1,
};

// Suite carries the project_id the case payload lacks; sections form a
// two-level chain so the path walk is exercised.
function mockGet(url: string) {
	switch (url) {
		case "/api/v2/get_case/37747":
			return Promise.resolve({ data: testCase });
		case "/api/v2/get_suite/113":
			return Promise.resolve({
				data: { id: 113, name: "User Feature Test Cases", project_id: 24 },
			});
		case "/api/v2/get_case_types":
			return Promise.resolve({ data: [{ id: 9, name: "Other" }] });
		case "/api/v2/get_priorities":
			return Promise.resolve({ data: [{ id: 2, name: "Medium" }] });
		case "/api/v2/get_statuses":
			return Promise.resolve({ data: [{ id: 1, name: "Passed" }] });
		case "/api/v2/get_project/24":
			return Promise.resolve({ data: { id: 24, name: "Mobile" } });
		case "/api/v2/get_templates/24":
			return Promise.resolve({ data: [{ id: 4, name: "BDD" }] });
		case "/api/v2/get_section/7357":
			return Promise.resolve({
				data: { id: 7357, name: "Registration", parent_id: 100 },
			});
		case "/api/v2/get_section/100":
			return Promise.resolve({
				data: { id: 100, name: "Onboarding", parent_id: null },
			});
		default:
			return Promise.reject(new Error(`unexpected GET ${url}`));
	}
}

function resolvedOf(result: unknown) {
	const toolResult = result as {
		isError?: boolean;
		content?: [{ text: string }];
	};
	expect(toolResult.isError).toBeFalsy();
	const text = toolResult.content?.[0]?.text;
	expect(text).toBeDefined();
	return JSON.parse(text as string).resolved;
}

describe("resolveCase", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("decodes ids into names plus the section path", async () => {
		const resolved = resolvedOf(await callResolveCase(mockGet, 37747));

		expect(resolved.project).toEqual({ id: 24, name: "Mobile" });
		expect(resolved.suite).toEqual({
			id: 113,
			name: "User Feature Test Cases",
		});
		expect(resolved.section_path).toEqual([
			{ id: 100, name: "Onboarding" },
			{ id: 7357, name: "Registration" },
		]);
		expect(resolved.type).toEqual({ id: 9, name: "Other" });
		expect(resolved.priority).toEqual({ id: 2, name: "Medium" });
		expect(resolved.template).toEqual({ id: 4, name: "BDD" });
		expect(resolved.case.id).toBe(37747);
	});

	it("still resolves when one lookup fails, with a null name", async () => {
		const failingPriorities = (url: string) => {
			if (url === "/api/v2/get_priorities") {
				return Promise.reject(new Error("boom"));
			}
			return mockGet(url);
		};
		const resolved = resolvedOf(
			await callResolveCase(failingPriorities, 37747),
		);

		expect(resolved.priority).toEqual({ id: 2, name: null });
		expect(resolved.type).toEqual({ id: 9, name: "Other" });
	});
});
