import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TestRailClient } from "../../client/api/index.js";
import { createSuccessResponse, createErrorResponse } from "./utils.js";
import { getSharedStepsSchema } from "../../shared/schemas/sharedSteps.js";

/**
 * Function to register shared step-related API tools
 * @param server McpServer instance
 * @param testRailClient TestRail client instance
 */
export function registerSharedStepTools(
	server: McpServer,
	testRailClient: TestRailClient,
): void {
	server.tool(
		"getSharedSteps",
		"Retrieves all shared steps for a specified TestRail project",
		getSharedStepsSchema,
		async ({ projectId, ...filters }) => {
			try {
				const sharedSteps = await testRailClient.sharedSteps.getSharedSteps(
					projectId,
					filters,
				);
				const successResponse = createSuccessResponse(
					"Shared steps retrieved successfully",
					{ sharedSteps },
				);
				return {
					content: [{ type: "text", text: JSON.stringify(successResponse) }],
				};
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching shared steps for project ${projectId}`,
					error,
				);
				return {
					content: [{ type: "text", text: JSON.stringify(errorResponse) }],
					isError: true,
				};
			}
		},
	);
}
