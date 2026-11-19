import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TestRailClient } from "../../client/api/index.js";
import { registerProjectTools } from "./projects.js";
import { registerCaseTools } from "./cases.js";
import { registerSectionTools } from "./sections.js";
import { registerSharedStepTools } from "./sharedSteps.js";
import { registerMilestoneTools } from "./milestones.js";
import { registerSuiteTools } from "./suites.js";
import { registerPlanTools } from "./plans.js";
import { registerRunTools } from "./runs.js";
import { registerUserTools } from "./users.js";
import { registerTestTools } from "./tests.js";
import { registerResultTools } from "./results.js";
import { registerUtilityTools } from "./utils.js";

/**
 * Function to register all API tools to the server
 * @param server McpServer server instance
 * @param testRailClient TestRail client instance
 */
export function registerAllTools(
	server: McpServer,
	testRailClient: TestRailClient,
): void {
	// Register tools for each resource type
	registerSuiteTools(server, testRailClient);
	registerProjectTools(server, testRailClient);
	registerCaseTools(server, testRailClient);
	registerSectionTools(server, testRailClient);
	registerRunTools(server, testRailClient);
	registerTestTools(server, testRailClient);
	registerResultTools(server, testRailClient);
	registerPlanTools(server, testRailClient);
	registerMilestoneTools(server, testRailClient);
	registerSharedStepTools(server, testRailClient);
	registerUtilityTools(server);
	registerUserTools(server, testRailClient);
}

// Export all tool modules
export * from "./projects.js";
export * from "./cases.js";
export * from "./sections.js";
export * from "./sharedSteps.js";
export * from "./milestones.js";
export * from "./suites.js";
export * from "./plans.js";
export * from "./runs.js";
export * from "./users.js";
export * from "./tests.js";
export * from "./results.js";
