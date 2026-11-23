import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TestRailClient } from "../../client/api/index.js";
import {
	createSuccessResponse,
	createErrorResponse,
	createPagination,
	formatErrorMessage,
	paginateArray,
	registerStrictTool,
} from "./utils.js";
import type { TestRailSection } from "../../shared/schemas/sections.js";
import type { TestRailCaseField } from "../../shared/schemas/cases.js";
import {
	getTestCaseSchema,
	getTestCasesSchema,
	getAttachmentsForCaseSchema,
	getAttachmentSchema,
	addAttachmentToCaseSchema,
	addTestCaseSchema,
	updateTestCaseSchema,
	deleteTestCaseSchema,
	getTestCaseTypesSchema,
	getTestCaseFieldsSchema,
	getCasesByIdsSchema,
	resolveCaseSchema,
	copyTestCasesToSectionSchema,
	moveTestCasesToSectionSchema,
	getTestCaseHistorySchema,
	updateTestCasesSchema,
	TestRailCase,
	addBddSchema,
	getBddSchema,
} from "../../shared/schemas/cases.js";

/**
 * When TestRail rejects a write over an unknown custom field, names the
 * valid fields so the caller can fix the call instead of guessing. Returns
 * null for any other error, keeping the original message untouched.
 * @param error The write failure, only read when it names an invalid field
 * @param fetchFields How to list the known field definitions
 * @returns The active custom field names, or null when not applicable
 */
export async function invalidFieldHint(
	error: unknown,
	fetchFields: () => Promise<{ system_name: string; is_active: boolean }[]>,
): Promise<string[] | null> {
	if (!/not a valid field/i.test(formatErrorMessage(error))) return null;
	try {
		const fields = await fetchFields();
		return fields.filter((f) => f.is_active).map((f) => f.system_name);
	} catch {
		return null;
	}
}

/**
 * Parses a dropdown option list from a case-field config. TestRail serializes
 * items as one option per line ("1, Open" or "1: Open"); both read the same.
 * Lines that do not start with a number are ignored, so text formats that
 * share the field never parse into false options.
 * @param items The raw options.items string from the field config
 * @returns Option id to label
 */
export function parseOptionItems(items: string): Map<number, string> {
	const names = new Map<number, string>();
	for (const line of items.split("\n")) {
		const match =
			/^(\d+)\s*[:,\-]\s*(.+?)\s*$/.exec(line) ??
			/^(\d+)\s+(.+?)\s*$/.exec(line);
		if (match) names.set(Number(match[1]), match[2]);
	}
	return names;
}

/**
 * Decodes project-scoped custom dropdown values into {id, name} pairs, the
 * same shape as the built-in type/priority/template decodes. Option lists
 * differ per project (and per template), so the applicable config is picked
 * the way TestRail picks it: the project-scoped config wins over the global
 * default, on a field active for this template. Fields without options, or
 * values with no options to match, are left out rather than guessed.
 * @param caseFields Field definitions from getCaseFields
 * @param testCase The case whose custom_* values to decode
 * @param projectId Owning project, from the suite when known
 * @returns Decoded custom values keyed by field name
 */
export function decodeCustomOptions(
	caseFields: TestRailCaseField[],
	testCase: TestRailCase,
	projectId?: number,
): Record<string, unknown> {
	// SAFETY: TestRailCase is a flat JSON object; the record view only reads custom_* keys and template_id.
	const record = testCase as unknown as Record<string, unknown>;
	const decoded: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (!key.startsWith("custom_") || value === null || value === undefined) {
			continue;
		}
		const field = caseFields.find((f) => f.system_name === key);
		const templateIds = field?.template_ids ?? [];
		if (
			!field ||
			(templateIds.length > 0 && !templateIds.includes(testCase.template_id))
		) {
			continue;
		}
		const configs = field.configs ?? [];
		const config =
			(projectId !== undefined &&
				configs.find((c) => c.context.project_ids.includes(projectId))) ||
			configs.find((c) => c.context.is_global);
		if (!config) continue;
		const names = parseOptionItems(config.options?.items ?? "");
		if (names.size === 0) continue;
		const decode = (id: unknown) =>
			typeof id === "number" ? { id, name: names.get(id) ?? null } : id;
		decoded[key] = Array.isArray(value) ? value.map(decode) : decode(value);
	}
	return decoded;
}

/**
 * Keeps only the requested keys. Unknown keys are ignored, so a typo degrades
 * to a smaller object rather than an error; the caller asked for less data.
 * @param obj The full object TestRail returned
 * @param fields Keys to keep, e.g. ["id","title","refs"]
 * @returns The object with only those keys that were present
 */
export function selectFields(
	obj: Record<string, unknown>,
	fields?: string[],
): Record<string, unknown> {
	if (!fields || fields.length === 0) return obj;
	const picked: Record<string, unknown> = {};
	for (const key of fields) {
		if (key in obj) picked[key] = obj[key];
	}
	return picked;
}

type ColumnName = keyof TestRailCase;

// Default columns that exclude large text fields
const defaultColumns: ColumnName[] = [
	"id",
	"title",
	"section_id",
	"template_id",
	"type_id",
	"priority_id",
	"milestone_id",
	"refs",
	"estimate",
	"suite_id",
	"display_order",
	"is_deleted",
	"status_id",
	"updated_on",
	"created_on",
	"created_by",
	"updated_by",
];

// Custom fields that always hold a body, so they never belong in a list
// response. Use getCase for these.
const excludedCustomColumns = new Set([
	"custom_preconds",
	"custom_steps",
	"custom_expected",
	"custom_steps_separated",
	// Written by this server's own addBdd tool: a whole .feature file.
	"custom_testrail_bdd_scenario",
]);

// A project can name a "Text" custom field anything, so length is the only
// portable way to spot one. TestRail's "String" type caps at 250 characters,
// so any real scalar survives this untouched.
//
// ponytail: length check, not field types. Deriving them would mean a
// getCaseFields call per getCases, against a 180/minute rate limit. Switch to
// that if truncation ever hides something a caller needed.
const CUSTOM_TEXT_LIMIT = 250;
const TRUNCATION_NOTE = "...[truncated, use getCase for the full value]";

/**
 * Builds the snake_case body TestRail expects from a case tool's camelCase
 * arguments. Named parameters are dropped when falsy so an omitted argument
 * never blanks a stored value; project-defined fields arrive through
 * `customFields` and are sent verbatim, because a caller who names a field
 * explicitly means the value they gave - including an empty string or null,
 * which is how TestRail clears a field.
 * @param args The validated tool arguments (extra keys are ignored)
 * @returns The request body for add_case / update_case / update_cases
 */
export function buildCasePayload(args: {
	title?: string;
	typeId?: number;
	priorityId?: number;
	estimate?: string;
	milestoneId?: number;
	refs?: string;
	templateId?: number;
	customPrerequisites?: string;
	customSteps?: string;
	customExpected?: string;
	customStepsSeparated?: unknown;
	customFields?: Record<string, unknown>;
}): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	const named: [string, unknown][] = [
		["title", args.title],
		["type_id", args.typeId],
		["priority_id", args.priorityId],
		["estimate", args.estimate],
		["milestone_id", args.milestoneId],
		["refs", args.refs],
		["template_id", args.templateId],
		["custom_preconds", args.customPrerequisites],
		["custom_steps", args.customSteps],
		["custom_expected", args.customExpected],
		["custom_steps_separated", args.customStepsSeparated],
	];
	for (const [key, value] of named) {
		if (value) {
			data[key] = value;
		}
	}
	for (const [key, value] of Object.entries(args.customFields ?? {})) {
		if (value !== undefined) {
			data[key] = value;
		}
	}
	return data;
}

/**
 * Reduces a test case to the fields worth returning in a list response:
 * the default columns plus any project-defined custom field. Custom field
 * names vary per project and cannot be read off TestRailCaseSchema, so they
 * are taken from the response itself. Long text values are truncated rather
 * than dropped, because an absent key cannot be told apart from an unset
 * required field, which is what callers read these in bulk to audit.
 * @param testCase A test case as returned by TestRail
 * @returns The case with bodies reduced and unknown non-custom fields dropped
 */
export function filterCaseColumns(
	testCase: Record<string, unknown>,
): Record<string, unknown> {
	// Always include id
	const filtered: Record<string, unknown> = { id: testCase.id };

	for (const column of defaultColumns) {
		if (column in testCase && column !== "id") {
			filtered[column] = testCase[column];
		}
	}

	for (const key of Object.keys(testCase)) {
		if (!key.startsWith("custom_") || excludedCustomColumns.has(key)) {
			continue;
		}

		const value = testCase[key];
		filtered[key] =
			typeof value === "string" && value.length > CUSTOM_TEXT_LIMIT
				? `${value.slice(0, CUSTOM_TEXT_LIMIT)}${TRUNCATION_NOTE}`
				: value;
	}

	return filtered;
}

/**
 * Function to register test case-related API tools
 * @param server McpServer instance
 * @param testRailClient TestRail client instance
 */
export function registerCaseTools(
	server: McpServer,
	testRailClient: TestRailClient,
): void {
	// Get a specific test case
	registerStrictTool(
		server,
		"getCase",
		"Retrieves complete details for a single test case including steps, expected results, and prerequisites. Enum ids (type_id, priority_id, custom_automation_status) are project-scoped: use resolveCase to read them as names. REQUIRED: caseId.",
		{
			caseId: getTestCaseSchema.shape.caseId,
			fields: getTestCaseSchema.shape.fields,
		},
		async (args) => {
			try {
				const { caseId, fields } = args;
				const testCase = await testRailClient.cases.getCase(caseId);

				// Return full case data for individual case requests
				const successResponse = createSuccessResponse(
					"Test case retrieved successfully",
					{
						case: selectFields(
							// SAFETY: TestRailCase is a flat JSON object; treating it as a string-keyed record only reads keys.
							testCase as unknown as Record<string, unknown>,
							fields,
						),
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching test case ${args.caseId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Get all test cases for a project
	registerStrictTool(
		server,
		"getCases",
		"Retrieves test cases list including the project's custom fields (preconditions, steps, expected results and BDD scenarios are excluded, and custom text values over 250 characters are truncated, for performance). REQUIRED: projectId, suiteId. OPTIONAL: createdBy, filter, limit (default 50), milestoneId, offset (default 0), priorityId, refs, sectionId, templateId, typeId, updatedBy, labelId. Use getCase for full details. Returns pagination: {limit, offset, count, hasMore}; repeat the call with offset advanced by limit while hasMore is true.",
		{
			projectId: getTestCasesSchema.shape.projectId,
			suiteId: getTestCasesSchema.shape.suiteId,
			createdBy: getTestCasesSchema.shape.createdBy,
			filter: getTestCasesSchema.shape.filter,
			limit: getTestCasesSchema.shape.limit,
			milestoneId: getTestCasesSchema.shape.milestoneId,
			offset: getTestCasesSchema.shape.offset,
			priorityId: getTestCasesSchema.shape.priorityId,
			refs: getTestCasesSchema.shape.refs,
			sectionId: getTestCasesSchema.shape.sectionId,
			templateId: getTestCasesSchema.shape.templateId,
			typeId: getTestCasesSchema.shape.typeId,
			updatedBy: getTestCasesSchema.shape.updatedBy,
			labelId: getTestCasesSchema.shape.labelId,
			fields: getTestCasesSchema.shape.fields,
		},
		async (args) => {
			try {
				const {
					projectId,
					suiteId,
					createdBy,
					filter,
					limit = 50,
					milestoneId,
					offset = 0,
					priorityId,
					refs,
					sectionId,
					templateId,
					typeId,
					updatedBy,
					labelId,
					fields,
				} = args;

				// Build params object with clean direct parameter mapping
				const params = {
					limit,
					offset,
					created_by: createdBy?.join(","),
					filter,
					milestone_id: milestoneId?.join(","),
					priority_id: priorityId?.join(","),
					refs,
					section_id: sectionId,
					template_id: templateId?.join(","),
					type_id: typeId?.join(","),
					updated_by: updatedBy?.join(","),
					label_id: labelId?.join(","),
				};

				const testCases = await testRailClient.cases.getCases(
					projectId,
					suiteId,
					params,
				);

				// Reduce the bodies to keep the response small. An explicit fields
				// list bypasses the reduction: the caller asked for those keys.
				const responseData = testCases.cases.map((testCase) =>
					fields && fields.length > 0
						? selectFields(
								// SAFETY: TestRailCase is a flat JSON object; reading it as a string-keyed record only reads keys.
								testCase as unknown as Record<string, unknown>,
								fields,
							)
						: filterCaseColumns(
								// SAFETY: TestRailCase is a flat JSON object; reading it as a string-keyed record only reads keys.
								testCase as unknown as Record<string, unknown>,
							),
				);

				const successResponse = createSuccessResponse(
					"Test cases retrieved successfully",
					{
						cases: responseData,
						pagination: createPagination(testCases),
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching test cases for project ${args.projectId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Add a new test case
	registerStrictTool(
		server,
		"addCase",
		"Creates a new test case in TestRail. REQUIRED: sectionId, title. OPTIONAL: typeId, priorityId, templateId, customSteps, customExpected, customStepsSeparated, customFields, etc. Use getCaseTypes to find valid typeId values. NOTE: templateId=2 is required to use customStepsSeparated (array of step objects with 'content' and 'expected' fields). For simple text steps, use customSteps and customExpected instead. Use customFields for any additional custom fields (e.g., {custom_case_security_score: 'high'}).",
		{
			sectionId: addTestCaseSchema.shape.sectionId,
			title: addTestCaseSchema.shape.title,
			typeId: addTestCaseSchema.shape.typeId,
			priorityId: addTestCaseSchema.shape.priorityId,
			estimate: addTestCaseSchema.shape.estimate,
			milestoneId: addTestCaseSchema.shape.milestoneId,
			refs: addTestCaseSchema.shape.refs,
			templateId: addTestCaseSchema.shape.templateId,
			customPrerequisites: addTestCaseSchema.shape.customPrerequisites,
			customSteps: addTestCaseSchema.shape.customSteps,
			customExpected: addTestCaseSchema.shape.customExpected,
			customStepsSeparated: addTestCaseSchema.shape.customStepsSeparated,
			customFields: addTestCaseSchema.shape.customFields,
		},
		async (args) => {
			try {
				const { sectionId } = args;
				const data = buildCasePayload(args);

				const testCase = await testRailClient.cases.addCase(sectionId, data);
				const successResponse = createSuccessResponse(
					"Test case created successfully",
					{
						case: testCase,
					},
				);
				return successResponse;
			} catch (error) {
				const valid = await invalidFieldHint(error, () =>
					testRailClient.cases.getCaseFields(),
				);
				const errorResponse = createErrorResponse(
					valid
						? `Error creating test case in section ${args.sectionId} (valid custom fields: ${valid.join(", ")})`
						: `Error creating test case in section ${args.sectionId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Update an existing test case
	registerStrictTool(
		server,
		"updateCase",
		"Updates an existing test case. REQUIRED: caseId. OPTIONAL: title, typeId, priorityId, templateId, customSteps, customExpected, customStepsSeparated, customFields, etc. Only specified fields will be updated. NOTE: templateId=2 is required to use customStepsSeparated (array of step objects with 'content' and 'expected' fields). For simple text steps, use customSteps and customExpected instead. Use customFields for any additional custom fields (e.g., {custom_case_security_score: 'high'}).",
		{
			caseId: updateTestCaseSchema.shape.caseId,
			title: updateTestCaseSchema.shape.title,
			typeId: updateTestCaseSchema.shape.typeId,
			priorityId: updateTestCaseSchema.shape.priorityId,
			estimate: updateTestCaseSchema.shape.estimate,
			milestoneId: updateTestCaseSchema.shape.milestoneId,
			refs: updateTestCaseSchema.shape.refs,
			templateId: updateTestCaseSchema.shape.templateId,
			customPrerequisites: updateTestCaseSchema.shape.customPrerequisites,
			customSteps: updateTestCaseSchema.shape.customSteps,
			customExpected: updateTestCaseSchema.shape.customExpected,
			customStepsSeparated: updateTestCaseSchema.shape.customStepsSeparated,
			customFields: updateTestCaseSchema.shape.customFields,
		},
		async (args) => {
			try {
				const { caseId } = args;
				const data = buildCasePayload(args);

				const testCase = await testRailClient.cases.updateCase(caseId, data);
				const successResponse = createSuccessResponse(
					"Test case updated successfully",
					{
						case: testCase,
					},
				);
				return successResponse;
			} catch (error) {
				const valid = await invalidFieldHint(error, () =>
					testRailClient.cases.getCaseFields(),
				);
				const errorResponse = createErrorResponse(
					valid
						? `Error updating test case ${args.caseId} (valid custom fields: ${valid.join(", ")})`
						: `Error updating test case ${args.caseId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Delete a test case
	registerStrictTool(
		server,
		"deleteCase",
		"Deletes a test case from TestRail. Pass dryRun to preview instead.",
		{
			caseId: deleteTestCaseSchema.shape.caseId,
			dryRun: deleteTestCaseSchema.shape.dryRun,
		},
		async (args) => {
			try {
				const { caseId, dryRun } = args;
				if (dryRun) {
					const testCase = await testRailClient.cases.getCase(caseId);
					return createSuccessResponse(
						`Dry run: test case ${caseId} would be deleted (nothing changed)`,
						{ case: { id: testCase.id, title: testCase.title } },
					);
				}
				await testRailClient.cases.deleteCase(caseId);
				const successResponse = createSuccessResponse(
					`Test case ${caseId} deleted successfully`,
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error deleting test case ${args.caseId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Get all test case types
	registerStrictTool(
		server,
		"getCaseTypes",
		"Retrieves all available test case types in TestRail. OPTIONAL: limit, offset; repeat with offset advanced by limit while pagination.hasMore is true.",
		{
			limit: getTestCaseTypesSchema.shape.limit,
			offset: getTestCaseTypesSchema.shape.offset,
		},
		async (args) => {
			try {
				const caseTypes = await testRailClient.cases.getCaseTypes();
				const { page, pagination } = paginateArray(
					caseTypes,
					args.limit,
					args.offset,
				);
				const successResponse = createSuccessResponse(
					"Test case types retrieved successfully",
					{
						caseTypes: page,
						pagination,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					"Error fetching test case types",
					error,
				);
				return errorResponse;
			}
		},
	);

	// Get all test case fields
	registerStrictTool(
		server,
		"getCaseFields",
		"Retrieves all available test case fields in TestRail. Use namesOnly for a ~1KB name list, or fields to pick keys per definition. namesOnly takes precedence when both are given.",
		{
			namesOnly: getTestCaseFieldsSchema.shape.namesOnly,
			fields: getTestCaseFieldsSchema.shape.fields,
			limit: getTestCaseFieldsSchema.shape.limit,
			offset: getTestCaseFieldsSchema.shape.offset,
		},
		async (args) => {
			try {
				const { namesOnly, fields, limit, offset } = args;
				const caseFields = await testRailClient.cases.getCaseFields();
				if (namesOnly) {
					const { page, pagination } = paginateArray(
						caseFields.map((f) => f.system_name),
						limit,
						offset,
					);
					return createSuccessResponse(
						"Test case field names retrieved successfully",
						{ fieldNames: page, pagination },
					);
				}
				const narrowed =
					fields && fields.length > 0
						? caseFields.map((f) =>
								selectFields(
									// SAFETY: field definitions are flat JSON objects; reading them as string-keyed records only reads keys.
									f as unknown as Record<string, unknown>,
									fields,
								),
							)
						: caseFields;
				const { page, pagination } = paginateArray(narrowed, limit, offset);
				const successResponse = createSuccessResponse(
					"Test case fields retrieved successfully",
					{
						caseFields: page,
						pagination,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					"Error fetching test case fields",
					error,
				);
				return errorResponse;
			}
		},
	);

	// Fetch several cases in one tool call
	registerStrictTool(
		server,
		"getCasesByIds",
		"Fetches several test cases in one call. Prefer this over N getCase calls when reconciling id lists.",
		{
			caseIds: getCasesByIdsSchema.shape.caseIds,
			fields: getCasesByIdsSchema.shape.fields,
		},
		async (args) => {
			try {
				const { caseIds, fields } = args;
				const { cases, notFound } =
					await testRailClient.cases.getCasesByIds(caseIds);
				return createSuccessResponse("Test cases retrieved successfully", {
					cases: cases.map((c) =>
						selectFields(
							// SAFETY: TestRailCase is a flat JSON object; reading it as a string-keyed record only reads keys.
							c as unknown as Record<string, unknown>,
							fields,
						),
					),
					notFound,
				});
			} catch (error) {
				return createErrorResponse("Error fetching test cases", error);
			}
		},
	);

	// Decode a case's ids into names plus its location path
	registerStrictTool(
		server,
		"resolveCase",
		"Returns a case with its ids decoded into names: project/suite/section path, type, priority, template and status. Enum ids are project-scoped (e.g. custom_automation_status 3 means different things per project), so prefer this over reading raw getCase ids.",
		{
			caseId: resolveCaseSchema.shape.caseId,
		},
		async (args) => {
			try {
				const testCase = await testRailClient.cases.getCase(args.caseId);
				const byId = (rows: { id: number; name: string }[] | null) => {
					const names: Record<number, string> = {};
					for (const r of rows ?? []) names[r.id] = r.name;
					return names;
				};
				// Each lookup is best-effort: an id without a resolved name
				// still returns the id, so one failed lookup never fails the call.
				// The case payload carries suite_id but no project_id, so the
				// project comes from the suite's project_id.
				const [suite, types, priorities, statuses, caseFields] =
					await Promise.all([
						testRailClient.suites.getSuite(testCase.suite_id).catch(() => null),
						testRailClient.cases.getCaseTypes().catch(() => null),
						testRailClient.cases.getPriorities().catch(() => null),
						testRailClient.cases.getStatuses().catch(() => null),
						testRailClient.cases.getCaseFields().catch(() => null),
					]);
				const projectId = suite?.project_id;
				const [project, templates] =
					projectId === undefined
						? [null, null]
						: await Promise.all([
								testRailClient.projects.getProject(projectId).catch(() => null),
								testRailClient.cases.getTemplates(projectId).catch(() => null),
							]);
				// Walk the section chain to build the location path. The seen
				// set stops a corrupt parent cycle from looping forever.
				const sectionPath: { id: number; name: string }[] = [];
				const seenSections = new Set<number>();
				let sectionId: number | undefined = testCase.section_id;
				while (sectionId !== undefined && !seenSections.has(sectionId)) {
					seenSections.add(sectionId);
					const currentId: number = sectionId;
					const section: TestRailSection | null = await testRailClient.sections
						.getSection(currentId)
						.catch(() => null);
					if (!section) break;
					sectionPath.unshift({ id: section.id, name: section.name });
					sectionId = section.parent_id ?? undefined;
				}
				const typeNames = byId(types);
				const priorityNames = byId(priorities);
				const statusNames = byId(statuses);
				const templateNames = byId(templates);
				const custom =
					caseFields === null
						? {}
						: decodeCustomOptions(caseFields, testCase, projectId);
				return createSuccessResponse("Test case resolved successfully", {
					resolved: {
						id: testCase.id,
						title: testCase.title,
						project: project
							? { id: project.id, name: project.name }
							: undefined,
						suite: suite ? { id: suite.id, name: suite.name } : undefined,
						section_path: sectionPath,
						type: {
							id: testCase.type_id,
							name: typeNames[testCase.type_id] ?? null,
						},
						priority: {
							id: testCase.priority_id,
							name: priorityNames[testCase.priority_id] ?? null,
						},
						template: {
							id: testCase.template_id,
							name: templateNames[testCase.template_id] ?? null,
						},
						status:
							testCase.status_id !== undefined
								? {
										id: testCase.status_id,
										name: statusNames[testCase.status_id] ?? null,
									}
								: undefined,
						custom,
						case: testCase,
					},
				});
			} catch (error) {
				return createErrorResponse(
					`Error resolving test case ${args.caseId}`,
					error,
				);
			}
		},
	);

	// Copy test cases to section
	registerStrictTool(
		server,
		"copyToSection",
		"Copies specified test cases to a target section while keeping the originals. Pass dryRun to preview instead.",
		{
			caseIds: copyTestCasesToSectionSchema.shape.caseIds,
			sectionId: copyTestCasesToSectionSchema.shape.sectionId,
			dryRun: copyTestCasesToSectionSchema.shape.dryRun,
		},
		async (args) => {
			try {
				const { caseIds, sectionId, dryRun } = args;
				if (dryRun) {
					return createSuccessResponse(
						`Dry run: ${caseIds.length} test case(s) would be copied to section ${sectionId} (nothing changed)`,
						{ caseIds, sectionId, count: caseIds.length },
					);
				}
				const result = await testRailClient.cases.copyToSection(
					caseIds,
					sectionId,
				);
				const successResponse = createSuccessResponse(
					"Test cases copied successfully",
					{
						result,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error copying test cases to section ${args.sectionId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Move test cases to section
	registerStrictTool(
		server,
		"moveToSection",
		"Moves specified test cases to a target section. Pass dryRun to preview instead.",
		{
			caseIds: moveTestCasesToSectionSchema.shape.caseIds,
			sectionId: moveTestCasesToSectionSchema.shape.sectionId,
			dryRun: moveTestCasesToSectionSchema.shape.dryRun,
		},
		async (args) => {
			try {
				const { caseIds, sectionId, dryRun } = args;
				if (dryRun) {
					return createSuccessResponse(
						`Dry run: ${caseIds.length} test case(s) would be moved to section ${sectionId} (nothing changed)`,
						{ caseIds, sectionId, count: caseIds.length },
					);
				}
				const result = await testRailClient.cases.moveToSection(
					caseIds,
					sectionId,
				);
				const successResponse = createSuccessResponse(
					"Test cases moved successfully",
					{
						result,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error moving test cases to section ${args.sectionId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Get test case history
	registerStrictTool(
		server,
		"getCaseHistory",
		"Retrieves the change history of a test case including updates to fields and custom fields. Histories are unbounded: pass limit/offset and repeat with offset advanced by limit while pagination.hasMore is true.",
		{
			caseId: getTestCaseHistorySchema.shape.caseId,
			limit: getTestCaseHistorySchema.shape.limit,
			offset: getTestCaseHistorySchema.shape.offset,
		},
		async (args) => {
			try {
				const { caseId, limit, offset } = args;
				const history = await testRailClient.cases.getCaseHistory(caseId);
				const { page, pagination } = paginateArray(history, limit, offset);
				const successResponse = createSuccessResponse(
					"Test case history retrieved successfully",
					{
						history: page,
						pagination,
					},
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error fetching history for test case ${args.caseId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Update multiple test cases
	registerStrictTool(
		server,
		"updateCases",
		"Updates multiple test cases simultaneously with the same field values. REQUIRED: suiteId, caseIds - the suite id is what scopes this call, projectId is accepted but ignored. NOTE: templateId=2 is required to use customStepsSeparated (array of step objects with 'content' and 'expected' fields). For simple text steps, use customSteps and customExpected instead. Use customFields for any additional custom fields (e.g., {custom_case_security_score: 'high'}).",
		{
			projectId: updateTestCasesSchema.shape.projectId,
			suiteId: updateTestCasesSchema.shape.suiteId,
			caseIds: updateTestCasesSchema.shape.caseIds,
			title: updateTestCasesSchema.shape.title,
			typeId: updateTestCasesSchema.shape.typeId,
			priorityId: updateTestCasesSchema.shape.priorityId,
			estimate: updateTestCasesSchema.shape.estimate,
			milestoneId: updateTestCasesSchema.shape.milestoneId,
			refs: updateTestCasesSchema.shape.refs,
			templateId: updateTestCasesSchema.shape.templateId,
			customPrerequisites: updateTestCasesSchema.shape.customPrerequisites,
			customSteps: updateTestCasesSchema.shape.customSteps,
			customExpected: updateTestCasesSchema.shape.customExpected,
			customStepsSeparated: updateTestCasesSchema.shape.customStepsSeparated,
			customFields: updateTestCasesSchema.shape.customFields,
			dryRun: updateTestCasesSchema.shape.dryRun,
		},
		async (args) => {
			try {
				const { projectId, suiteId, caseIds, dryRun } = args;

				const data = buildCasePayload(args);

				if (dryRun) {
					return createSuccessResponse(
						`Dry run: ${caseIds.length} test case(s) would be updated with ${Object.keys(data).length} field(s) (nothing changed)`,
						{ caseIds, count: caseIds.length, payload: data },
					);
				}
				await testRailClient.cases.updateCases(
					projectId,
					suiteId,
					data,
					caseIds,
				);
				const successResponse = createSuccessResponse(
					"Test cases updated successfully",
				);
				return successResponse;
			} catch (error) {
				const valid = await invalidFieldHint(error, () =>
					testRailClient.cases.getCaseFields(),
				);
				const errorResponse = createErrorResponse(
					valid
						? `Error updating test cases in suite ${args.suiteId} (valid custom fields: ${valid.join(", ")})`
						: `Error updating test cases in suite ${args.suiteId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Import a BDD .feature file into a section
	registerStrictTool(
		server,
		"addBdd",
		"Imports/uploads a .feature file (Gherkin BDD scenario) into a TestRail section. Creates a new test case with BDD template (template_id=4) and populates the custom_testrail_bdd_scenario field. REQUIRED: sectionId, featureContent (raw Gherkin text including Feature:, Scenario:, Given/When/Then).",
		{
			sectionId: addBddSchema.shape.sectionId,
			featureContent: addBddSchema.shape.featureContent,
		},
		async (args) => {
			try {
				const { sectionId, featureContent } = args;
				const result = await testRailClient.cases.addBdd(
					sectionId,
					featureContent,
				);
				const successResponse = createSuccessResponse(
					"BDD scenario imported successfully",
					{ case: result },
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error importing BDD scenario to section ${args.sectionId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// Export a BDD test case as .feature file
	registerStrictTool(
		server,
		"getBdd",
		"Exports a BDD test case as a .feature file in Gherkin format. REQUIRED: caseId.",
		{
			caseId: getBddSchema.shape.caseId,
		},
		async (args) => {
			try {
				const { caseId } = args;
				const result = await testRailClient.cases.getBdd(caseId);
				const successResponse = createSuccessResponse(
					"BDD scenario exported successfully",
					{ featureContent: result },
				);
				return successResponse;
			} catch (error) {
				const errorResponse = createErrorResponse(
					`Error exporting BDD scenario for case ${args.caseId}`,
					error,
				);
				return errorResponse;
			}
		},
	);

	// List a case's attachments
	registerStrictTool(
		server,
		"getAttachmentsForCase",
		"Lists the files attached to a test case (screenshots, fixtures). REQUIRED: caseId. OPTIONAL: limit, offset; repeat with offset advanced by limit while pagination.hasMore is true.",
		{
			caseId: getAttachmentsForCaseSchema.shape.caseId,
			limit: getAttachmentsForCaseSchema.shape.limit,
			offset: getAttachmentsForCaseSchema.shape.offset,
		},
		async (args) => {
			try {
				const envelope = await testRailClient.cases.getAttachmentsForCase(
					args.caseId,
				);
				const { page, pagination } = paginateArray(
					envelope.attachments,
					args.limit,
					args.offset,
				);
				return createSuccessResponse("Attachments retrieved successfully", {
					attachments: page,
					pagination,
				});
			} catch (error) {
				return createErrorResponse(
					`Error fetching attachments for case ${args.caseId}`,
					error,
				);
			}
		},
	);

	// Download one attachment as base64, or save it to disk
	registerStrictTool(
		server,
		"getAttachment",
		"Downloads one attachment: base64 by default, or pass saveToPath to write the file on the server host and get back path + size instead (a 2MB screenshot is ~2.7MB of base64 in context). maxBytes refuses oversized files with a clear error. REQUIRED: attachmentId.",
		{
			attachmentId: getAttachmentSchema.shape.attachmentId,
			saveToPath: getAttachmentSchema.shape.saveToPath,
			maxBytes: getAttachmentSchema.shape.maxBytes,
		},
		async (args) => {
			try {
				if (args.saveToPath) {
					// Server-side write: bytes go to disk, never into context.
					const { bytes, mimeType } =
						await testRailClient.cases.getAttachmentBytes(
							args.attachmentId,
							args.maxBytes,
						);
					const { mkdir, writeFile } = await import("node:fs/promises");
					const { dirname } = await import("node:path");
					await mkdir(dirname(args.saveToPath), { recursive: true });
					await writeFile(args.saveToPath, bytes);
					return createSuccessResponse("Attachment saved successfully", {
						attachment: {
							attachmentId: args.attachmentId,
							savedTo: args.saveToPath,
							sizeBytes: bytes.length,
							...(mimeType ? { mimeType } : {}),
						},
					});
				}
				const attachment = await testRailClient.cases.getAttachment(
					args.attachmentId,
					args.maxBytes,
				);
				return createSuccessResponse("Attachment retrieved successfully", {
					attachment,
				});
			} catch (error) {
				return createErrorResponse(
					`Error fetching attachment ${args.attachmentId}`,
					error,
				);
			}
		},
	);

	// Upload a file to a case
	registerStrictTool(
		server,
		"addAttachmentToCase",
		"Uploads a file from the server host to a test case, where it becomes visible to anyone with case access. Only attach files meant to be published there. REQUIRED: caseId, filePath (absolute path the server can read).",
		{
			caseId: addAttachmentToCaseSchema.shape.caseId,
			filePath: addAttachmentToCaseSchema.shape.filePath,
		},
		async (args) => {
			try {
				const attachment = await testRailClient.cases.addAttachmentToCase(
					args.caseId,
					args.filePath,
				);
				return createSuccessResponse("Attachment uploaded successfully", {
					attachment,
				});
			} catch (error) {
				return createErrorResponse(
					`Error uploading attachment to case ${args.caseId}`,
					error,
				);
			}
		},
	);
}
