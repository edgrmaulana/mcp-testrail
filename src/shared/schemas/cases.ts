import { z } from "zod";

// Schema for retrieving a specific test case
export const getTestCaseSchema = z.object({
	caseId: z.number().describe("TestRail Case ID"),
	fields: z
		.array(z.string())
		.optional()
		.describe(
			'Return only these keys (e.g. ["id","title","refs"]) to save context. Unknown keys are silently ignored.',
		),
});

// Schema for retrieving all test cases in a project
export const getTestCasesSchema = z.object({
	projectId: z.number().describe("TestRail Project ID"),
	suiteId: z.number().describe("TestRail Suite ID"),
	createdBy: z
		.array(z.number())
		.optional()
		.describe("A comma-separated list of creators (user IDs) to filter by"),
	filter: z
		.string()
		.optional()
		.describe(
			"Only return cases with matching filter string in the case title",
		),
	limit: z
		.number()
		.min(1)
		.optional()
		.default(50)
		.describe(
			"The number of test cases the response should return (The response size is 50 by default) —requires TestRail 6.7 or later",
		),
	milestoneId: z
		.array(z.number())
		.optional()
		.describe(
			"A comma-separated list of milestone IDs to filter by (not available if the milestone field is disabled for the project)",
		),
	offset: z
		.number()
		.optional()
		.default(0)
		.describe(
			"Where to start counting the tests cases from (the offset)—requires TestRail 6.7 or later",
		),
	priorityId: z
		.array(z.number())
		.optional()
		.describe("A comma-separated list of priority IDs to filter by"),
	refs: z
		.string()
		.optional()
		.describe(
			"A single Reference ID (e.g. TR-1, 4291, etc.) —requires TestRail 6.5.2 or later",
		),
	sectionId: z.number().optional().describe("The ID of a test case section"),
	templateId: z
		.array(z.number())
		.optional()
		.describe(
			"A comma-separated list of template IDs to filter by —requires TestRail 5.2 or later",
		),
	typeId: z
		.array(z.number())
		.optional()
		.describe("A comma-separated list of case type IDs to filter by"),
	updatedBy: z
		.array(z.number())
		.optional()
		.describe(
			"A comma-separated list of user IDs who updated test cases to filter by",
		),
	labelId: z
		.array(z.number())
		.optional()
		.describe("A comma-separated list of label IDs to filter by"),
	fields: z
		.array(z.string())
		.optional()
		.describe(
			'Return only these keys per case (e.g. ["id","title","refs"]) to save context. Bodies excluded by default stay excluded unless named here.',
		),
});

// Schema for adding a test case
export const addTestCaseSchema = z.object({
	sectionId: z.number().describe("TestRail Section ID"),
	title: z.string().describe("Test case title"),
	typeId: z.number().optional().describe("Test case type ID"),
	priorityId: z.number().optional().describe("Test case priority ID"),
	estimate: z.string().optional().describe("Test case estimated time"),
	milestoneId: z.number().optional().describe("TestRail Milestone ID"),
	refs: z.string().optional().describe("Test case references"),
	templateId: z
		.number()
		.optional()
		.describe("Template ID (use 2 for custom_steps_separated support)"),
	customPrerequisites: z.string().optional().describe("Prerequisites"),
	customSteps: z.string().optional().describe("Test case steps"),
	customExpected: z.string().optional().describe("Expected results"),
	customStepsSeparated: z
		.array(
			z
				.object({
					content: z.string().describe("Step content"),
					expected: z.string().describe("Expected result"),
				})
				.passthrough(),
		)
		.optional()
		.describe("Separated test steps array (requires template_id=2)"),
	customFields: z
		.record(z.unknown())
		.optional()
		.describe(
			"Additional custom fields as key-value pairs (e.g., {custom_case_security_score: 'high'})",
		),
});

// Schema for updating a test case
export const updateTestCaseSchema = z.object({
	caseId: z.number().describe("TestRail Case ID"),
	title: z.string().optional().describe("Test case title"),
	typeId: z.number().optional().describe("Test case type ID"),
	priorityId: z.number().optional().describe("Test case priority ID"),
	estimate: z.string().optional().describe("Test case estimated time"),
	milestoneId: z.number().optional().describe("TestRail Milestone ID"),
	refs: z.string().optional().describe("Test case references"),
	templateId: z
		.number()
		.optional()
		.describe("Template ID (use 2 for custom_steps_separated support)"),
	customPrerequisites: z.string().optional().describe("Prerequisites"),
	customSteps: z.string().optional().describe("Test case steps"),
	customExpected: z.string().optional().describe("Expected results"),
	customStepsSeparated: z
		.array(
			z
				.object({
					content: z.string().describe("Step content"),
					expected: z.string().describe("Expected result"),
				})
				.passthrough(),
		)
		.optional()
		.describe("Separated test steps array (requires template_id=2)"),
	customFields: z
		.record(z.unknown())
		.optional()
		.describe(
			"Additional custom fields as key-value pairs (e.g., {custom_case_security_score: 'high'})",
		),
});

// Schema for deleting a test case
export const deleteTestCaseSchema = z.object({
	caseId: z.number().describe("TestRail Case ID"),
	dryRun: z
		.boolean()
		.optional()
		.describe(
			"Preview only: validates the case exists (404 if not) and returns its id + title without deleting anything.",
		),
});

// Schema for retrieving test case types
export const getTestCaseTypesSchema = z.object({
	limit: z
		.number()
		.min(1)
		.optional()
		.describe("Maximum types to return (omitted: all)"),
	offset: z.number().optional().describe("Types to skip (default 0)"),
});

// Schema for retrieving test case fields
export const getTestCaseFieldsSchema = z.object({
	namesOnly: z
		.boolean()
		.optional()
		.describe(
			"Return only system_name strings (~1KB) instead of the full 60KB definitions. Takes precedence when both are given; order follows the API.",
		),
	fields: z
		.array(z.string())
		.optional()
		.describe(
			'Return only these keys per field definition (e.g. ["system_name","label"]). Unknown keys are silently ignored.',
		),
	limit: z
		.number()
		.min(1)
		.optional()
		.describe("Maximum fields to return (omitted: all)"),
	offset: z.number().optional().describe("Fields to skip (default 0)"),
});

// Fetch several cases in one tool call (TestRail has no bulk get;
// the server fans out to get_case, so prefer this over N getCase calls)
export const getCasesByIdsSchema = z.object({
	caseIds: z
		.array(z.number())
		.min(1)
		.max(100)
		.describe("Array of TestRail Case IDs (max 100 per call)"),
	fields: z
		.array(z.string())
		.optional()
		.describe(
			'Return only these keys per case (e.g. ["id","title","refs"]). Unknown keys are silently ignored.',
		),
});

// Schema for a decoded case: ids plus human-readable names and location path
export const resolveCaseSchema = z.object({
	caseId: z.number().describe("TestRail Case ID"),
});

// Schema for copying test cases to a section
export const copyTestCasesToSectionSchema = z.object({
	caseIds: z.array(z.number()).describe("Array of TestRail Case IDs"),
	sectionId: z.number().describe("Target TestRail Section ID"),
	dryRun: z
		.boolean()
		.optional()
		.describe("Preview only: echo the targets without copying anything"),
});

// Schema for moving test cases to a section
export const moveTestCasesToSectionSchema = z.object({
	caseIds: z.array(z.number()).describe("Array of TestRail Case IDs"),
	sectionId: z.number().describe("Target TestRail Section ID"),
	dryRun: z
		.boolean()
		.optional()
		.describe("Preview only: echo the targets without moving anything"),
});

// Schema for retrieving test case history
export const getTestCaseHistorySchema = z.object({
	caseId: z.number().describe("TestRail Case ID"),
	limit: z
		.number()
		.min(1)
		.optional()
		.describe(
			"Maximum history entries to return (omitted: all). Histories are unbounded, so pass a limit and page with offset on busy cases.",
		),
	offset: z.number().optional().describe("History entries to skip (default 0)"),
});

// Schema for listing a case's attachments (failure screenshots, fixtures)
export const getAttachmentsForCaseSchema = z.object({
	caseId: z.number().describe("TestRail Case ID"),
	limit: z
		.number()
		.min(1)
		.optional()
		.describe("Maximum attachments to return (omitted: all)"),
	offset: z.number().optional().describe("Attachments to skip (default 0)"),
});

// Schema for downloading one attachment (returned as base64 for the caller to save,
// or written to saveToPath so large files never enter model context)
export const getAttachmentSchema = z.object({
	attachmentId: z.number().describe("TestRail Attachment ID"),
	saveToPath: z
		.string()
		.optional()
		.describe(
			"Absolute path to write the file to (server host). When set, returns path + size instead of base64.",
		),
	maxBytes: z
		.number()
		.min(1)
		.optional()
		.describe(
			"Refuse files over this many bytes (default 5MB). A 2MB file is ~2.7MB of base64 in context.",
		),
});

// Schema for uploading a file to a case. filePath is read from the machine
// the server runs on (stdio mode: the same host as the files).
export const addAttachmentToCaseSchema = z.object({
	caseId: z.number().describe("TestRail Case ID"),
	filePath: z.string().describe("Absolute path of the file to attach"),
});

// Schema for updating multiple test cases
export const updateTestCasesSchema = z.object({
	// TestRail's update_cases route keys off the suite id alone, so the project
	// id is accepted for symmetry with the other tools but never sent.
	projectId: z.number().optional().describe("TestRail Project ID (unused)"),
	suiteId: z.number().describe("TestRail Suite ID"),
	caseIds: z.array(z.number()).describe("Array of TestRail Case IDs"),
	title: z.string().optional().describe("Test case title"),
	typeId: z.number().optional().describe("Test case type ID"),
	priorityId: z.number().optional().describe("Test case priority ID"),
	estimate: z.string().optional().describe("Test case estimated time"),
	milestoneId: z.number().optional().describe("TestRail Milestone ID"),
	refs: z.string().optional().describe("Test case references"),
	templateId: z
		.number()
		.optional()
		.describe("Template ID (use 2 for custom_steps_separated support)"),
	customPrerequisites: z.string().optional().describe("Prerequisites"),
	customSteps: z.string().optional().describe("Test case steps"),
	customExpected: z.string().optional().describe("Expected results"),
	customStepsSeparated: z
		.array(
			z
				.object({
					content: z.string().describe("Step content"),
					expected: z.string().describe("Expected result"),
				})
				.passthrough(),
		)
		.optional()
		.describe("Separated test steps array (requires template_id=2)"),
	customFields: z
		.record(z.unknown())
		.optional()
		.describe(
			"Additional custom fields as key-value pairs (e.g., {custom_case_security_score: 'high'})",
		),
	dryRun: z
		.boolean()
		.optional()
		.describe("Preview only: echo the payload without updating anything"),
});

// Create Zod objects from each schema
export const getTestCaseInputSchema = getTestCaseSchema;
export const getTestCasesInputSchema = getTestCasesSchema;
export const addTestCaseInputSchema = addTestCaseSchema;
export const updateTestCaseInputSchema = updateTestCaseSchema;
export const deleteTestCaseInputSchema = deleteTestCaseSchema;
export const getTestCaseTypesInputSchema = getTestCaseTypesSchema;
export const getTestCaseFieldsInputSchema = getTestCaseFieldsSchema;
export const copyTestCasesToSectionInputSchema = copyTestCasesToSectionSchema;
export const moveTestCasesToSectionInputSchema = moveTestCasesToSectionSchema;
export const getTestCaseHistoryInputSchema = getTestCaseHistorySchema;
export const updateTestCasesInputSchema = updateTestCasesSchema;
export const getCasesByIdsInputSchema = getCasesByIdsSchema;
export const resolveCaseInputSchema = resolveCaseSchema;

// Extract input types
export type GetTestCaseInput = z.infer<typeof getTestCaseInputSchema>;
export type GetTestCasesInput = z.infer<typeof getTestCasesInputSchema>;
export type AddTestCaseInput = z.infer<typeof addTestCaseInputSchema>;
export type UpdateTestCaseInput = z.infer<typeof updateTestCaseInputSchema>;
export type DeleteTestCaseInput = z.infer<typeof deleteTestCaseInputSchema>;
export type GetTestCaseTypesInput = z.infer<typeof getTestCaseTypesInputSchema>;
export type GetTestCaseFieldsInput = z.infer<
	typeof getTestCaseFieldsInputSchema
>;
export type CopyTestCasesToSectionInput = z.infer<
	typeof copyTestCasesToSectionInputSchema
>;
export type MoveTestCasesToSectionInput = z.infer<
	typeof moveTestCasesToSectionInputSchema
>;
export type GetTestCaseHistoryInput = z.infer<
	typeof getTestCaseHistoryInputSchema
>;
export type UpdateTestCasesInput = z.infer<typeof updateTestCasesInputSchema>;
export type GetCasesByIdsInput = z.infer<typeof getCasesByIdsInputSchema>;
export type ResolveCaseInput = z.infer<typeof resolveCaseInputSchema>;

// -----------------------------------------------
// Response schema definitions migrated from types.ts
// -----------------------------------------------

/**
 * TestRail API Response for Step
 */
export const TestRailStepSchema = z.object({
	content: z.string(),
	expected: z.string(),
});
export type TestRailStep = z.infer<typeof TestRailStepSchema>;

/**
 * TestRail API Response for Case
 */
export const TestRailCaseSchema = z.object({
	id: z.number(),
	title: z.string(),
	section_id: z.number(),
	template_id: z.number(),
	type_id: z.number(),
	priority_id: z.number(),
	milestone_id: z.number().nullable(),
	refs: z.string().nullable(),
	created_by: z.number(),
	created_on: z.number(),
	updated_by: z.number().nullable(),
	updated_on: z.number().nullable(),
	estimate: z.string().nullable(),
	estimate_forecast: z.string().nullable(),
	suite_id: z.number(),
	display_order: z.number(),
	is_deleted: z.boolean().default(false).optional(),
	status_id: z.number().optional(),
	custom_preconds: z.string().nullable().optional(),
	custom_steps: z.string().nullable().optional(),
	custom_expected: z.string().nullable().optional(),
	custom_steps_separated: z.array(TestRailStepSchema).nullable().optional(),
});
export type TestRailCase = z.infer<typeof TestRailCaseSchema>;

/**
 * TestRail API Response for Case Type
 */
export const TestRailCaseTypeSchema = z.object({
	id: z.number(),
	name: z.string(),
	is_default: z.boolean(),
});
export type TestRailCaseType = z.infer<typeof TestRailCaseTypeSchema>;

/**
 * TestRail API Response for Case Field Config
 */
export const TestRailCaseFieldConfigSchema = z.object({
	id: z.string(),
	context: z.object({
		is_global: z.boolean(),
		project_ids: z.array(z.number()),
	}),
	options: z.object({
		default_value: z.string(),
		format: z.string(),
		is_required: z.boolean(),
		rows: z.string(),
		items: z.string(),
	}),
});
export type TestRailCaseFieldConfig = z.infer<
	typeof TestRailCaseFieldConfigSchema
>;

/**
 * TestRail API Response for Case Field
 */
export const TestRailCaseFieldSchema = z.object({
	id: z.number(),
	type_id: z.number(),
	name: z.string(),
	system_name: z.string(),
	label: z.string(),
	description: z.string(),
	configs: z.array(TestRailCaseFieldConfigSchema),
	display_order: z.number(),
	include_all: z.boolean(),
	template_ids: z.array(z.number()),
	is_active: z.boolean(),
	status_id: z.number(),
});
export type TestRailCaseField = z.infer<typeof TestRailCaseFieldSchema>;

/**
 * TestRail API Response for Case History
 */
export const TestRailCaseHistorySchema = z.object({
	id: z.number(),
	case_id: z.number(),
	user_id: z.number(),
	timestamp: z.number(),
	changes: z.array(
		z.object({
			field: z.string(),
			old_value: z.string().nullable(),
			new_value: z.string().nullable(),
		}),
	),
});
export type TestRailCaseHistory = z.infer<typeof TestRailCaseHistorySchema>;

// -----------------------------------------------
// Client API data schemas (snake_case for TestRail API)
// -----------------------------------------------

/**
 * Schema for data when adding a test case via client API
 * Uses .passthrough() to allow any custom fields (custom_*) from TestRail
 */
export const addCaseDataSchema = z
	.object({
		title: z.string().optional(),
		type_id: z.number().optional(),
		priority_id: z.number().optional(),
		template_id: z.number().optional(),
		estimate: z.string().optional(),
		milestone_id: z.number().optional(),
		refs: z.string().optional(),
		custom_preconds: z.string().optional(),
		custom_steps: z.string().optional(),
		custom_expected: z.string().optional(),
		custom_steps_separated: z
			.array(
				z
					.object({
						content: z.string(),
						expected: z.string(),
					})
					.passthrough(),
			)
			.optional(),
	})
	.passthrough();

/**
 * Schema for data when updating a test case via client API
 * Uses .passthrough() to allow any custom fields (custom_*) from TestRail
 */
export const updateCaseDataSchema = z
	.object({
		title: z.string().optional(),
		type_id: z.number().optional(),
		priority_id: z.number().optional(),
		template_id: z.number().optional(),
		estimate: z.string().optional(),
		milestone_id: z.number().optional(),
		refs: z.string().optional(),
		custom_preconds: z.string().optional(),
		custom_steps: z.string().optional(),
		custom_expected: z.string().optional(),
		custom_steps_separated: z
			.array(
				z
					.object({
						content: z.string(),
						expected: z.string(),
					})
					.passthrough(),
			)
			.optional(),
	})
	.passthrough();

export type AddCaseData = z.infer<typeof addCaseDataSchema>;
export type UpdateCaseData = z.infer<typeof updateCaseDataSchema>;

// Schema for importing a BDD scenario
export const addBddSchema = z.object({
	sectionId: z
		.number()
		.describe("TestRail Section ID where the BDD case will be created"),
	featureContent: z
		.string()
		.describe("Raw Gherkin .feature file content (plain text)"),
});

// Schema for exporting a BDD scenario
export const getBddSchema = z.object({
	caseId: z.number().describe("TestRail Case ID to export as .feature"),
});
