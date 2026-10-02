import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TestRailClient } from "../../client/api/index.js";
import { createSuccessResponse, createErrorResponse } from "./utils.js";
import {
	getSuitesSchema,
	getSuiteSchema,
	addSuiteSchema,
	updateSuiteSchema,
} from "../../shared/schemas/suites.js";

/**
 * Function to register test suite-related API tools
 * @param server McpServer instance
 * @param testRailClient TestRail client instance
 */
export function registerSuiteTools(
	server: McpServer,
	testRailClient: TestRailClient,
): void {
	// Get all test suites for a project
	server.tool(
		"getSuites",
		"Retrieves all test suites for a specified TestRail project",
		{
			projectId: getSuitesSchema.shape.projectId.describe(
				"TestRail Project ID to get suites from",
			),
		},
		async (args, extra) => {
			try {
				const { projectId } = args;
				const suites = await testRailClient.suites.getSuites(projectId);
				const successResponse = createSuccessResponse(
					"Test suites retrieved successfully",
					{
						suites,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching test suites for project ${args.projectId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Get a specific test suite
	server.tool(
		"getSuite",
		"Retrieves details of a specific test suite by ID",
		{
			suiteId: getSuiteSchema.shape.suiteId.describe(
				"TestRail Suite ID to retrieve",
			),
		},
		async (args, extra) => {
			try {
				const { suiteId } = args;
				const suite = await testRailClient.suites.getSuite(suiteId);
				const successResponse = createSuccessResponse(
					"Test suite retrieved successfully",
					{
						suite,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching test suite ${args.suiteId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Create a new test suite
	server.tool(
		"addSuite",
		"Creates a new test suite in the specified project",
		{
			projectId: addSuiteSchema.shape.projectId.describe(
				"TestRail Project ID where the suite will be created",
			),
			name: addSuiteSchema.shape.name.describe("Name of the test suite"),
			description: addSuiteSchema.shape.description.describe(
				"Description of the test suite (optional)",
			),
		},
		async (args, extra) => {
			try {
				const { projectId, name, description } = args;
				const data = {
					name,
					description,
				};
				const suite = await testRailClient.suites.addSuite(projectId, data);
				const successResponse = createSuccessResponse(
					"Test suite created successfully",
					{
						suite,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error creating test suite for project ${args.projectId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Update an existing test suite
	server.tool(
		"updateSuite",
		"Updates an existing test suite",
		{
			suiteId: updateSuiteSchema.shape.suiteId.describe(
				"TestRail Suite ID to update",
			),
			name: updateSuiteSchema.shape.name.describe(
				"New name for the test suite (optional)",
			),
			description: updateSuiteSchema.shape.description.describe(
				"New description for the test suite (optional)",
			),
		},
		async (args, extra) => {
			try {
				const { suiteId, name, description } = args;
				const data: { name?: string; description?: string } = {};

				if (name) data.name = name;
				if (description) data.description = description;

				const suite = await testRailClient.suites.updateSuite(suiteId, data);
				const successResponse = createSuccessResponse(
					"Suite updated successfully",
					{
						suite,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error updating suite ${args.suiteId}`,
					error,
				);
				return errorResponse;
			}
		},
	);
}
