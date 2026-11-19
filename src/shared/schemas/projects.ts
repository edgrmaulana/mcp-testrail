import { z } from "zod";

// Schema for retrieving all projects
export const getProjectsSchema = z.object({
	limit: z
		.number()
		.min(1)
		.optional()
		.describe("Maximum projects to return (omitted: all)"),
	offset: z.number().optional().describe("Projects to skip (default 0)"),
});

// Schema for retrieving a specific project
export const getProjectSchema = z.object({
	projectId: z.number().describe("TestRail Project ID"),
});

// Schema for adding a project
export const addProjectSchema = z.object({
	name: z.string().describe("Project name (required)"),
	announcement: z
		.string()
		.optional()
		.describe("Project description/announcement"),
	show_announcement: z
		.boolean()
		.optional()
		.describe("Show announcement on project overview page"),
	suite_mode: z
		.number()
		.min(1)
		.max(3)
		.optional()
		.describe(
			"Suite mode: 1 for single suite, 2 for single suite with baselines, 3 for multiple suites",
		),
});

// Schema for updating a project
export const updateProjectSchema = z.object({
	projectId: z.number().describe("TestRail Project ID"),
	name: z.string().optional().describe("Project name"),
	announcement: z
		.string()
		.optional()
		.describe("Project description/announcement"),
	show_announcement: z
		.boolean()
		.optional()
		.describe("Show announcement on project overview page"),
	is_completed: z.boolean().optional().describe("Mark project as completed"),
});

// Schema for deleting a project
export const deleteProjectSchema = z.object({
	projectId: z.number().describe("TestRail Project ID"),
});

// Create Zod objects from each schema
export const getProjectsInputSchema = getProjectsSchema;
export const getProjectInputSchema = getProjectSchema;
export const addProjectInputSchema = addProjectSchema;
export const updateProjectInputSchema = updateProjectSchema;
export const deleteProjectInputSchema = deleteProjectSchema;

// Extract input types
export type GetProjectsInput = z.infer<typeof getProjectsInputSchema>;
export type GetProjectInput = z.infer<typeof getProjectInputSchema>;
export type AddProjectInput = z.infer<typeof addProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type DeleteProjectInput = z.infer<typeof deleteProjectInputSchema>;

// Response schema definitions migrated from types.ts
export const TestRailProjectSchema = z.object({
	id: z.number(),
	name: z.string(),
	announcement: z.string().nullable(),
	show_announcement: z.boolean(),
	is_completed: z.boolean(),
	completed_on: z.number().nullable(),
	url: z.string(),
	suite_mode: z.number(),
});

export type TestRailProject = z.infer<typeof TestRailProjectSchema>;
