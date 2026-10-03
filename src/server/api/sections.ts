import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TestRailClient } from "../../client/api/index.js";
import {
	createSuccessResponse,
	createErrorResponse,
	createPagination,
	registerStrictTool,
} from "./utils.js";
import {
	getSectionSchema,
	getSectionsSchema,
	addSectionSchema,
	moveSectionSchema,
	updateSectionSchema,
	deleteSectionSchema,
} from "../../shared/schemas/sections.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Turns a delete_section response into the tool result.
 *
 * TestRail answers a preview with the affected-entity counts and a real
 * deletion with an empty body, so an empty payload after asking for a preview
 * means the section is gone. That must never be reported as a successful
 * preview: a caller asking what would be destroyed has to hear that something
 * was, not that nothing happened.
 * @param sectionId The ID of the section
 * @param soft Whether a preview was requested
 * @param result The normalized response payload
 * @returns The tool result to hand back
 */
export function describeSectionDeletion(
	sectionId: number,
	soft: boolean | undefined,
	result: Record<string, unknown>,
): CallToolResult {
	if (!soft) {
		return createSuccessResponse(`Section ${sectionId} deleted successfully`);
	}

	if (Object.keys(result).length === 0) {
		return createErrorResponse(
			`Section ${sectionId} was not previewed`,
			new Error(
				"TestRail returned no dry-run payload, which means the section may have been deleted. Verify with getSection before retrying.",
			),
		);
	}

	return createSuccessResponse(
		`Section ${sectionId} was previewed, not deleted`,
		{ affected: result },
	);
}

/**
 * Function to register section-related API tools
 * @param server McpServer instance
 * @param testRailClient TestRail client instance
 */
export function registerSectionTools(
	server: McpServer,
	testRailClient: TestRailClient,
): void {
	// Get a specific section
	registerStrictTool(
		server,
		"getSection",
		"Retrieves details of a specific section by ID",
		getSectionSchema,
		async ({ sectionId }) => {
			try {
				const section = await testRailClient.sections.getSection(sectionId);
				const successResponse = createSuccessResponse(
					"Section retrieved successfully",
					{
						section,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching section ${sectionId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Get sections for a project or suite with pagination
	registerStrictTool(
		server,
		"getSections",
		"Retrieves sections for a specified project and suite. Supports pagination via limit and offset parameters (default: limit=250, offset=0). Use pagination.hasMore to determine if more pages are available.",
		getSectionsSchema,
		async ({ projectId, suiteId, limit, offset }) => {
			try {
				const params: { limit?: number; offset?: number } = {};
				if (limit !== undefined) params.limit = limit;
				if (offset !== undefined) params.offset = offset;

				const result = await testRailClient.sections.getSections(
					projectId,
					suiteId,
					params,
				);
				const successResponse = createSuccessResponse(
					"Sections retrieved successfully",
					{
						sections: result.sections,
						pagination: createPagination(result),
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching sections for project ${projectId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Create a new section
	registerStrictTool(
		server,
		"addSection",
		"Creates a new section in a TestRail project",
		addSectionSchema,
		async ({ projectId, name, description, suiteId, parentId }) => {
			try {
				const data = {
					name,
					description,
					suite_id: suiteId,
					parent_id: parentId,
				};

				const section = await testRailClient.sections.addSection(
					projectId,
					data,
				);
				const successResponse = createSuccessResponse(
					"Section created successfully",
					{
						section,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					"Error creating section",
					error,
				);
				return errorResponse;
			}
		},
	);

	// Move a section
	registerStrictTool(
		server,
		"moveSection",
		"Moves a section to a new position in the test hierarchy",
		moveSectionSchema,
		async ({ sectionId, parentId, afterId }) => {
			try {
				const moveData: {
					parent_id?: number | null;
					after_id?: number | null;
				} = {};

				if (parentId !== undefined) moveData.parent_id = parentId;
				if (afterId !== undefined) moveData.after_id = afterId;

				const section = await testRailClient.sections.moveSection(
					sectionId,
					moveData,
				);
				const successResponse = createSuccessResponse(
					"Section moved successfully",
					{
						section,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error moving section ${sectionId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Update a section
	registerStrictTool(
		server,
		"updateSection",
		"Updates an existing section",
		updateSectionSchema,
		async ({ sectionId, name, description }) => {
			try {
				const updateData: { name?: string; description?: string } = {};
				if (name) updateData.name = name;
				if (description) updateData.description = description;

				const section = await testRailClient.sections.updateSection(
					sectionId,
					updateData,
				);
				const successResponse = createSuccessResponse(
					"Section updated successfully",
					{
						section,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error updating section ${sectionId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Delete a section
	registerStrictTool(
		server,
		"deleteSection",
		"Deletes a section and all of its test cases, which cannot be undone. REQUIRED: sectionId. OPTIONAL: soft - true previews the deletion instead of performing it, returning the number of affected cases without removing anything.",
		deleteSectionSchema,
		async ({ sectionId, soft }) => {
			try {
				const result = await testRailClient.sections.deleteSection(
					sectionId,
					soft,
				);
				return describeSectionDeletion(sectionId, soft, result);
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error deleting section ${sectionId}`,
					error,
				);
				return errorResponse;
			}
		},
	);
}
