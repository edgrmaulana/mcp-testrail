import { z } from "zod";

// Schema for retrieving test results
export const getResultsSchema = {
	testId: z.number().describe("TestRail Test ID"),
	limit: z
		.number()
		.optional()
		.describe("The number of results to return per page"),
	offset: z
		.number()
		.optional()
		.describe("The offset to start returning results"),
	statusId: z
		.string()
		.optional()
		.describe("Filter by status IDs (comma-separated)"),
	defectsFilter: z.string().optional().describe("Filter by defect ID"),
};

// Schema for retrieving test results for a specific case
export const getResultsForCaseSchema = {
	runId: z.number().describe("TestRail Run ID"),
	caseId: z.number().describe("TestRail Case ID"),
	limit: z
		.number()
		.optional()
		.describe("The number of results to return per page"),
	offset: z
		.number()
		.optional()
		.describe("The offset to start returning results"),
	statusId: z
		.string()
		.optional()
		.describe("Filter by status IDs (comma-separated)"),
	defectsFilter: z.string().optional().describe("Filter by defect ID"),
};

// Schema for retrieving test results for a run
export const getResultsForRunSchema = {
	runId: z.number().describe("TestRail Run ID"),
	limit: z
		.number()
		.optional()
		.describe("The number of results to return per page"),
	offset: z
		.number()
		.optional()
		.describe("The offset to start returning results"),
	statusId: z
		.string()
		.optional()
		.describe("Filter by status IDs (comma-separated)"),
	defectsFilter: z.string().optional().describe("Filter by defect ID"),
};

// Schema for adding a test result
export const addResultSchema = {
	testId: z.number().describe("TestRail Test ID"),
	statusId: z
		.number()
		.optional()
		.describe("Status ID (1:Pass, 2:Blocked, 3:Untested, 4:Retest, 5:Fail)"),
	comment: z.string().optional().describe("Comment for the test result"),
	defects: z.string().optional().describe("Defects linked to the test result"),
	assignedtoId: z.number().optional().describe("User to assign the test to"),
	version: z.string().optional().describe("Version or build tested"),
	elapsed: z
		.string()
		.optional()
		.describe("Time spent testing (e.g., '30s', '2m 30s')"),
};

// Schema for adding a test result for a specific case
export const addResultForCaseSchema = {
	runId: z.number().describe("TestRail Run ID"),
	caseId: z.number().describe("TestRail Case ID"),
	statusId: z
		.number()
		.optional()
		.describe("Status ID (1:Pass, 2:Blocked, 3:Untested, 4:Retest, 5:Fail)"),
	comment: z.string().optional().describe("Comment for the test result"),
	defects: z.string().optional().describe("Defects linked to the test result"),
	assignedtoId: z.number().optional().describe("User to assign the test to"),
	version: z.string().optional().describe("Version or build tested"),
	elapsed: z
		.string()
		.optional()
		.describe("Time spent testing (e.g., '30s', '2m 30s')"),
};

// Schema for adding multiple test results
export const addResultsSchema = {
	runId: z.number().describe("TestRail Run ID"),
	results: z
		.array(
			z
				.object({
					testId: z.number().describe("TestRail Test ID"),
					statusId: z
						.number()
						.optional()
						.describe(
							"Status ID (1:Pass, 2:Blocked, 3:Untested, 4:Retest, 5:Fail)",
						),
					comment: z
						.string()
						.optional()
						.describe("Comment for the test result"),
					defects: z
						.string()
						.optional()
						.describe("Defects linked to the test result"),
					assignedtoId: z
						.number()
						.optional()
						.describe("User to assign the test to"),
					version: z.string().optional().describe("Version or build tested"),
					elapsed: z
						.string()
						.optional()
						.describe("Time spent testing (e.g., '30s', '2m 30s')"),
				})
				.strict(),
		)
		.describe("Array of test results to add"),
};

// Schema for adding multiple test results for cases
export const addResultsForCasesSchema = {
	runId: z.number().describe("TestRail Run ID"),
	results: z
		.array(
			z
				.object({
					caseId: z.number().describe("TestRail Case ID"),
					statusId: z
						.number()
						.optional()
						.describe(
							"Status ID (1:Pass, 2:Blocked, 3:Untested, 4:Retest, 5:Fail)",
						),
					comment: z
						.string()
						.optional()
						.describe("Comment for the test result"),
					defects: z
						.string()
						.optional()
						.describe("Defects linked to the test result"),
					assignedtoId: z
						.number()
						.optional()
						.describe("User to assign the test to"),
					version: z.string().optional().describe("Version or build tested"),
					elapsed: z
						.string()
						.optional()
						.describe("Time spent testing (e.g., '30s', '2m 30s')"),
				})
				.strict(),
		)
		.describe("Array of test case results to add"),
};

// Create Zod objects from each schema
export const GetResultsInput = z.object(getResultsSchema);
export const GetResultsForCaseInput = z.object(getResultsForCaseSchema);
export const GetResultsForRunInput = z.object(getResultsForRunSchema);
export const AddResultInput = z.object(addResultSchema);
export const AddResultForCaseInput = z.object(addResultForCaseSchema);
export const AddResultsInput = z.object(addResultsSchema);
export const AddResultsForCasesInput = z.object(addResultsForCasesSchema);

// Extract input types
export type GetResultsInputType = z.infer<typeof GetResultsInput>;
export type GetResultsForCaseInputType = z.infer<typeof GetResultsForCaseInput>;
export type GetResultsForRunInputType = z.infer<typeof GetResultsForRunInput>;
export type AddResultInputType = z.infer<typeof AddResultInput>;
export type AddResultForCaseInputType = z.infer<typeof AddResultForCaseInput>;
export type AddResultsInputType = z.infer<typeof AddResultsInput>;
export type AddResultsForCasesInputType = z.infer<
	typeof AddResultsForCasesInput
>;

// -----------------------------------------------
// Response schema definitions - migrated from types.ts
// -----------------------------------------------

/**
 * TestRail API Response for Step Result
 */
export const TestRailStepResultSchema = z.object({
	status_id: z.number(),
	content: z.string(),
	expected: z.string(),
	actual: z.string(),
});
export type TestRailStepResult = z.infer<typeof TestRailStepResultSchema>;

/**
 * TestRail API Response for Result
 */
export const TestRailResultSchema = z.object({
	id: z.number(),
	test_id: z.number(),
	status_id: z.number(),
	created_by: z.number(),
	created_on: z.number(),
	assignedto_id: z.number(),
	comment: z.string(),
	version: z.string(),
	elapsed: z.string(),
	defects: z.string(),
	custom_step_results: z.array(TestRailStepResultSchema).optional(),
	custom_fields: z.record(z.unknown()).optional(),
});
export type TestRailResult = z.infer<typeof TestRailResultSchema>;
