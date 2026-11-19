import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TestRailClient } from "../../client/api/index.js";
import {
	createSuccessResponse,
	createErrorResponse,
	paginateArray,
	registerStrictTool,
} from "./utils.js";
import {
	getRunsSchema,
	getRunSchema,
	addRunSchema,
	updateRunSchema,
	closeRunSchema,
	getConfigurationsSchema,
	deleteRunSchema,
} from "../../shared/schemas/runs.js";

/**
 * Function to register test run-related API tools
 * @param server McpServer instance
 * @param testRailClient TestRail client instance
 */
export function registerRunTools(
	server: McpServer,
	testRailClient: TestRailClient,
): void {
	// Get all test runs for a project
	registerStrictTool(
		server,
		"getRuns",
		"Retrieves all test runs for a specified TestRail project",
		getRunsSchema,
		async ({ projectId, createdBy, ...filters }) => {
			try {
				// Convert createdBy to string format
				const params: Record<
					string,
					string | number | boolean | null | undefined
				> = {
					...filters,
				};

				if (createdBy) {
					params.created_by = createdBy.join(",");
				}

				const runs = await testRailClient.runs.getRuns(projectId, params);
				const successResponse = createSuccessResponse(
					"Test runs retrieved successfully",
					{
						runs,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching test runs for project ${projectId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Get a specific test run
	registerStrictTool(
		server,
		"getRun",
		"Retrieves details of a specific test run by ID",
		getRunSchema,
		async ({ runId }) => {
			try {
				const run = await testRailClient.runs.getRun(runId);
				const successResponse = createSuccessResponse(
					"Test run retrieved successfully",
					{
						run,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching test run ${runId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Create a new test run
	registerStrictTool(
		server,
		"addRun",
		"Creates a new test run in a TestRail project",
		addRunSchema,
		async ({
			projectId,
			suiteId,
			name,
			description,
			milestoneId,
			assignedtoId,
			includeAll,
			caseIds,
			configIds,
			refs,
		}) => {
			try {
				const data = {
					name,
					suite_id: suiteId,
					description,
					milestone_id: milestoneId,
					assignedto_id: assignedtoId,
					include_all: includeAll,
					case_ids: caseIds,
					config_ids: configIds,
					refs,
				};

				const run = await testRailClient.runs.addRun(projectId, data);
				const successResponse = createSuccessResponse(
					"Test run created successfully",
					{
						run,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error creating test run for project ${projectId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Update an existing test run
	registerStrictTool(
		server,
		"updateRun",
		"Updates an existing test run",
		updateRunSchema,
		async ({
			runId,
			name,
			description,
			milestoneId,
			assignedtoId,
			includeAll,
			caseIds,
			refs,
		}) => {
			try {
				const data = {
					name,
					description,
					milestone_id: milestoneId,
					assignedto_id: assignedtoId,
					include_all: includeAll,
					case_ids: caseIds,
					refs,
				};

				const run = await testRailClient.runs.updateRun(runId, data);
				const successResponse = createSuccessResponse(
					"Test run updated successfully",
					{
						run,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error updating test run ${runId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Delete a test run
	registerStrictTool(
		server,
		"deleteRun",
		"Deletes a test run, which cannot be undone. Pass dryRun to preview instead.",
		deleteRunSchema,
		async ({ runId, dryRun }) => {
			try {
				if (dryRun) {
					const run = await testRailClient.runs.getRun(runId);
					return createSuccessResponse(
						`Dry run: test run ${runId} would be deleted (nothing changed)`,
						{ run: { id: run.id, name: run.name } },
					);
				}
				await testRailClient.runs.deleteRun(runId);
				return createSuccessResponse(`Test run ${runId} deleted successfully`);
			} catch (error) {
				return createErrorResponse(`Error deleting test run ${runId}`, error);
			}
		},
	);

	// Close a test run
	registerStrictTool(
		server,
		"closeRun",
		"Closes a test run. Reversible, unlike deleteRun — prefer this to retire CI runs.",
		closeRunSchema,
		async ({ runId }) => {
			try {
				const run = await testRailClient.runs.closeRun(runId);
				return createSuccessResponse(`Test run ${runId} closed successfully`, {
					run,
				});
			} catch (error) {
				return createErrorResponse(`Error closing test run ${runId}`, error);
			}
		},
	);

	// List a project's configuration groups
	registerStrictTool(
		server,
		"getConfigurations",
		"Lists a project's configuration groups: the matrices whose ids addRun accepts as configIds. OPTIONAL: limit, offset; repeat with offset advanced by limit while pagination.hasMore is true.",
		getConfigurationsSchema,
		async ({ projectId, limit, offset }) => {
			try {
				const configurations =
					await testRailClient.runs.getConfigurations(projectId);
				const { page, pagination } = paginateArray(
					configurations,
					limit,
					offset,
				);
				return createSuccessResponse("Configurations retrieved successfully", {
					configurations: page,
					pagination,
				});
			} catch (error) {
				return createErrorResponse(
					`Error fetching configurations for project ${projectId}`,
					error,
				);
			}
		},
	);
}
