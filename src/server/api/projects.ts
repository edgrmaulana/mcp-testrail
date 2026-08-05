import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TestRailClient } from "../../client/api/index.js";
import { createSuccessResponse, createErrorResponse } from "./utils.js";
import {
	getProjectsSchema,
	getProjectSchema,
	addProjectSchema,
	updateProjectSchema,
	deleteProjectSchema,
} from "../../shared/schemas/projects.js";

/**
 * Function to register project-related API tools
 * @param server McpServer instance
 * @param testRailClient TestRail client instance
 */
export function registerProjectTools(
	server: McpServer,
	testRailClient: TestRailClient,
): void {
	// Get all projects
	server.tool(
		"getProjects",
		"Retrieves all TestRail projects",
		{},
		async (args, extra) => {
			try {
				const projects = await testRailClient.projects.getProjects();
				const successResponse = createSuccessResponse(
					"Projects retrieved successfully",
					{
						data: projects,
					},
				);
				return {
					content: [{ type: "text", text: JSON.stringify(successResponse) }],
				};
			} catch (error) {
				const errorResponse = createErrorResponse(
					"Error fetching projects",
					error,
				);
				return {
					content: [{ type: "text", text: JSON.stringify(errorResponse) }],
					isError: true,
				};
			}
		},
	);

	// Get a specific project by ID
	server.tool(
		"getProject",
		"Retrieves details of a specific TestRail project by ID",
		{
			projectId: getProjectSchema.shape.projectId.describe(
				"TestRail Project ID to retrieve",
			),
		},
		async (args, extra) => {
			try {
				const { projectId } = args;
				const project = await testRailClient.projects.getProject(projectId);
				const successResponse = createSuccessResponse(
					"Project retrieved successfully",
					{
						project,
					},
				);
				return {
					content: [{ type: "text", text: JSON.stringify(successResponse) }],
				};
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching project ${args.projectId}`,
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
