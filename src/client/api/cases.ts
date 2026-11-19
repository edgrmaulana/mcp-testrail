import { AxiosResponse } from "axios";
import { BaseTestRailClient } from "./baseClient.js";
import {
	TestRailCase,
	TestRailCaseField,
	TestRailCaseType,
	TestRailCaseHistory,
	addCaseDataSchema,
	updateCaseDataSchema,
	AddCaseData,
	UpdateCaseData,
} from "../../shared/schemas/cases.js";
import { handleApiError, getErrorStatus } from "./utils.js";
import {
	GetTestCaseInput,
	GetTestCasesInput,
	AddTestCaseInput,
	UpdateTestCaseInput,
	DeleteTestCaseInput,
	CopyTestCasesToSectionInput,
	MoveTestCasesToSectionInput,
	GetTestCaseHistoryInput,
	GetCasesByIdsInput,
} from "../../shared/schemas/cases.js";

interface GetCasesParams {
	limit?: number;
	offset?: number;
	[key: string]: string | number | boolean | null | undefined;
}

// Inline base64 inflates bytes by a third and the host truncates past ~50KB,
// so anything this big was never going to arrive intact. Refuse it instead.
// shortcut: fixed 5MB; raise it if large screenshots ever need inlining.
const MAX_INLINE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export class CasesClient extends BaseTestRailClient {
	/**
	 * Gets a specific test case by ID
	 * @param caseId The ID of the test case
	 * @returns Promise with test case details
	 */
	async getCase(caseId: GetTestCaseInput["caseId"]): Promise<TestRailCase> {
		try {
			const response: AxiosResponse<TestRailCase> = await this.client.get(
				`/api/v2/get_case/${caseId}`,
			);
			return response.data;
		} catch (error) {
			throw handleApiError(error, `Failed to get test case ${caseId}`);
		}
	}

	/**
	 * Gets test cases for a specific project and suite
	 * @param projectId The ID of the project
	 * @param suiteId The ID of the test suite
	 * @param params Optional parameters including pagination (limit, offset) and other filters
	 * @returns Promise with array of test cases
	 */
	async getCases(
		projectId: GetTestCasesInput["projectId"],
		suiteId: number,
		params?: Partial<GetCasesParams>,
	): Promise<{
		cases: TestRailCase[];
		offset: number;
		limit: number;
		size: number;
		_links: { next: string | null; prev: string | null };
	}> {
		try {
			const defaultParams = {
				limit: 50,
				offset: 0,
				...params,
			};

			const response: AxiosResponse<{
				cases: TestRailCase[];
				offset: number;
				limit: number;
				size: number;
				_links: { next: string | null; prev: string | null };
			}> = await this.client.get(`/api/v2/get_cases/${projectId}`, {
				params: {
					suite_id: suiteId,
					...defaultParams,
				},
			});
			return {
				cases: response.data.cases,
				offset: response.data.offset,
				limit: response.data.limit,
				size: response.data.size,
				_links: response.data._links,
			};
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to get test cases for project ${projectId}`,
			);
		}
	}

	/**
	 * Adds a new test case to a section
	 * @param sectionId The ID of the section
	 * @param data The test case data
	 * @returns Promise with created test case
	 */
	async addCase(
		sectionId: AddTestCaseInput["sectionId"],
		data: AddCaseData,
	): Promise<TestRailCase> {
		// Validate data with Zod schema
		const validatedData = addCaseDataSchema.parse(data);

		try {
			const response: AxiosResponse<TestRailCase> = await this.client.post(
				`/api/v2/add_case/${sectionId}`,
				validatedData,
			);
			return response.data;
		} catch (error) {
			// TestRail returns HTTP 500 when a required multi-select custom field
			// (type 12) is set, but the case IS created server-side. Recover by
			// locating the created case instead of reporting a false failure.
			// ponytail: title + newest-id match; picks wrong case only if another
			// case with the exact same title already exists in the section.
			if (getErrorStatus(error) === 500 && validatedData.title) {
				const recovered = await this.findCreatedCase(
					sectionId,
					validatedData.title,
				).catch(() => null);
				if (recovered) return recovered;
			}
			throw handleApiError(
				error,
				`Failed to add test case to section ${sectionId}`,
			);
		}
	}

	/**
	 * Finds a case in a section by title, returning the newest match (highest id).
	 * Used to recover the record created by an add_case that returned a spurious 500.
	 */
	private async findCreatedCase(
		sectionId: number,
		title: string,
	): Promise<TestRailCase | null> {
		const section: AxiosResponse<{ suite_id: number }> = await this.client.get(
			`/api/v2/get_section/${sectionId}`,
		);
		const suiteId = section.data.suite_id;
		const suite: AxiosResponse<{ project_id: number }> = await this.client.get(
			`/api/v2/get_suite/${suiteId}`,
		);
		const projectId = suite.data.project_id;
		const res: AxiosResponse<{ cases: TestRailCase[] }> = await this.client.get(
			`/api/v2/get_cases/${projectId}`,
			{ params: { suite_id: suiteId, section_id: sectionId, limit: 250 } },
		);
		const matches = res.data.cases.filter((c) => c.title === title);
		if (matches.length === 0) return null;
		return matches.reduce((a, b) => (b.id > a.id ? b : a));
	}

	/**
	 * Updates an existing test case
	 * @param caseId The ID of the test case
	 * @param data The test case data to update
	 * @returns Promise with updated test case
	 */
	async updateCase(
		caseId: UpdateTestCaseInput["caseId"],
		data: UpdateCaseData,
	): Promise<TestRailCase> {
		// Validate data with Zod schema
		const validatedData = updateCaseDataSchema.parse(data);

		try {
			const response: AxiosResponse<TestRailCase> = await this.client.post(
				`/api/v2/update_case/${caseId}`,
				validatedData,
			);
			return response.data;
		} catch (error) {
			// Same TestRail 500-on-multiselect quirk; the update is applied
			// server-side. We hold caseId, so recovery is exact: re-fetch the case.
			if (getErrorStatus(error) === 500) {
				const recovered = await this.getCase(caseId).catch(() => null);
				if (recovered) return recovered;
			}
			throw handleApiError(error, `Failed to update test case ${caseId}`);
		}
	}

	/**
	 * Deletes an existing test case
	 * @param caseId The ID of the test case
	 */
	async deleteCase(caseId: DeleteTestCaseInput["caseId"]): Promise<void> {
		try {
			await this.client.post(`/api/v2/delete_case/${caseId}`, {});
		} catch (error) {
			throw handleApiError(error, `Failed to delete test case ${caseId}`);
		}
	}

	/**
	 * Fetches several cases with one call. TestRail has no bulk get endpoint,
	 * so this fans out to get_case; callers should prefer it over N getCase
	 * calls so the batch is one tool call and one rate-limit budget.
	 * Only a 404 lands an id in notFound; any other failure is rethrown so a
	 * dead credential or throttled run never reads as "cases don't exist".
	 * @param caseIds IDs to fetch (max 100)
	 * @returns Cases in request order, plus the ids that were not found
	 */
	async getCasesByIds(
		caseIds: GetCasesByIdsInput["caseIds"],
	): Promise<{ cases: TestRailCase[]; notFound: number[] }> {
		// Ten at a time stays well under TestRail Cloud's 180/minute budget;
		// one unbounded Promise.all over 100 ids walks straight into the limiter.
		const settled: (
			| { ok: true; value: TestRailCase }
			| { ok: false; id: number }
		)[] = [];
		for (let i = 0; i < caseIds.length; i += 10) {
			const batch = await Promise.all(
				caseIds.slice(i, i + 10).map(async (id) => {
					try {
						return { ok: true as const, value: await this.getCase(id) };
					} catch (error) {
						if (getErrorStatus(error) === 404)
							return { ok: false as const, id };
						throw error;
					}
				}),
			);
			settled.push(...batch);
		}
		return {
			cases: settled.flatMap((r) => (r.ok ? [r.value] : [])),
			notFound: settled.flatMap((r) => (r.ok ? [] : [r.id])),
		};
	}

	/**
	 * Lookup tables used to decode the enum-ish ids on a case. Each is a
	 * single small GET; resolveCase calls them best-effort.
	 */
	async getPriorities(): Promise<{ id: number; name: string }[]> {
		try {
			const res = await this.client.get<{ id: number; name: string }[]>(
				"/api/v2/get_priorities",
			);
			return res.data;
		} catch (error) {
			throw handleApiError(error, "Failed to get priorities");
		}
	}

	async getStatuses(): Promise<{ id: number; name: string }[]> {
		try {
			const res = await this.client.get<{ id: number; name: string }[]>(
				"/api/v2/get_statuses",
			);
			return res.data;
		} catch (error) {
			throw handleApiError(error, "Failed to get statuses");
		}
	}

	async getTemplates(
		projectId: number,
	): Promise<{ id: number; name: string }[]> {
		try {
			const res = await this.client.get<{ id: number; name: string }[]>(
				`/api/v2/get_templates/${projectId}`,
			);
			return res.data;
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to get templates for project ${projectId}`,
			);
		}
	}

	/**
	 * Lists a case's attachments (failure screenshots, data fixtures).
	 * @param caseId The ID of the test case
	 */
	async getAttachmentsForCase(caseId: number) {
		try {
			const response = await this.client.get(
				`/api/v2/get_attachments_for_case/${caseId}`,
			);
			return response.data as {
				attachments: { id: number; name: string }[];
				limit: number;
				offset: number;
				size: number;
				_links: { next: string | null; prev: string | null };
			};
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to get attachments for test case ${caseId}`,
			);
		}
	}

	/**
	 * Downloads one attachment as base64 for the caller to save. Binary
	 * cannot travel in the JSON tool envelope, so it is encoded here.
	 * Refuses files over the inline limit instead of letting the host
	 * silently truncate the response tail.
	 * @param attachmentId The ID of the attachment
	 */
	async getAttachment(
		attachmentId: number,
	): Promise<{ attachmentId: number; contentBase64: string }> {
		try {
			const response = await this.client.get<ArrayBuffer>(
				`/api/v2/get_attachment/${attachmentId}`,
				{ responseType: "arraybuffer" },
			);
			const bytes = Buffer.from(response.data);
			if (bytes.length > MAX_INLINE_ATTACHMENT_BYTES) {
				throw new Error(
					`Attachment ${attachmentId} is ${(bytes.length / 1024 / 1024).toFixed(1)}MB, over the ${(MAX_INLINE_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0)}MB inline limit; download it from TestRail directly`,
				);
			}
			return { attachmentId, contentBase64: bytes.toString("base64") };
		} catch (error) {
			throw handleApiError(error, `Failed to get attachment ${attachmentId}`);
		}
	}

	/**
	 * Uploads a file from the server host to a case. Follows the addBdd
	 * multipart pattern; the file is streamed, never held in memory whole.
	 * The file must already be readable, and it becomes visible on the case,
	 * so only attach files meant to be published there.
	 * @param caseId The ID of the test case
	 * @param filePath Absolute path of the file to attach
	 */
	async addAttachmentToCase(caseId: number, filePath: string) {
		try {
			const { createReadStream, constants } = await import("node:fs");
			const { access } = await import("node:fs/promises");
			const { basename } = await import("node:path");
			// Fail here with a named path instead of a stream error mid-upload.
			await access(filePath, constants.R_OK);
			const FormData = (await import("form-data")).default;
			const form = new FormData();
			form.append("attachment", createReadStream(filePath), basename(filePath));
			const response = await this.client.post(
				`/api/v2/add_attachment_to_case/${caseId}`,
				form,
				{ headers: form.getHeaders() },
			);
			return response.data;
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to add attachment to test case ${caseId}`,
			);
		}
	}

	/**
	 * Gets the history of changes for a specific test case
	 * @param caseId The ID of the test case
	 * @returns Promise with test case history
	 */
	async getCaseHistory(
		caseId: GetTestCaseHistoryInput["caseId"],
	): Promise<TestRailCaseHistory[]> {
		try {
			const response: AxiosResponse<TestRailCaseHistory[]> =
				await this.client.get(`/api/v2/get_history_for_case/${caseId}`);
			return response.data;
		} catch (error) {
			throw handleApiError(error, "Failed to get test case history");
		}
	}

	/**
	 * Gets all available test case types
	 * @returns Promise with array of case types
	 */
	async getCaseTypes(): Promise<TestRailCaseType[]> {
		try {
			const response: AxiosResponse<TestRailCaseType[]> = await this.client.get(
				"/api/v2/get_case_types",
			);
			return response.data;
		} catch (error) {
			throw handleApiError(error, "Failed to get case types");
		}
	}

	/**
	 * Gets all available test case fields
	 * @returns Promise with array of case fields
	 */
	async getCaseFields(): Promise<TestRailCaseField[]> {
		try {
			const response: AxiosResponse<TestRailCaseField[]> =
				await this.client.get("/api/v2/get_case_fields");
			return response.data;
		} catch (error) {
			throw handleApiError(error, "Failed to get case fields");
		}
	}

	/**
	 * Copies test cases to a different section
	 * @param caseIds Array of test case IDs to copy
	 * @param sectionId The ID of the target section
	 * @returns Promise with status
	 */
	async copyToSection(
		caseIds: CopyTestCasesToSectionInput["caseIds"],
		sectionId: CopyTestCasesToSectionInput["sectionId"],
	): Promise<{ status: boolean }> {
		try {
			const data = {
				case_ids: caseIds,
			};
			const response: AxiosResponse<{ status: boolean }> =
				await this.client.post(
					`/api/v2/copy_cases_to_section/${sectionId}`,
					data,
				);
			return response.data;
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to copy test cases to section ${sectionId}`,
			);
		}
	}

	/**
	 * Moves test cases to a different section
	 * @param caseIds Array of test case IDs to move
	 * @param sectionId The ID of the target section
	 * @returns Promise with status
	 */
	async moveToSection(
		caseIds: MoveTestCasesToSectionInput["caseIds"],
		sectionId: MoveTestCasesToSectionInput["sectionId"],
	): Promise<{ status: boolean }> {
		try {
			const data = {
				case_ids: caseIds,
			};
			const response: AxiosResponse<{ status: boolean }> =
				await this.client.post(
					`/api/v2/move_cases_to_section/${sectionId}`,
					data,
				);
			return response.data;
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to move test cases to section ${sectionId}`,
			);
		}
	}

	/**
	 * Updates multiple test cases at once
	 * @param projectId Accepted for symmetry with the other case methods and
	 * never sent; TestRail scopes this endpoint by the suite id alone
	 * @param suiteId The ID of the test suite, used as the path parameter
	 * @param data Data to update on the test cases
	 * @param caseIds Array of test case IDs to update
	 */
	async updateCases(
		_projectId: GetTestCasesInput["projectId"] | undefined,
		suiteId: number,
		data: UpdateCaseData,
		caseIds: UpdateTestCaseInput["caseId"][],
	): Promise<void> {
		try {
			// Validate data with Zod schema
			const validatedData = updateCaseDataSchema.parse(data);

			// TestRail takes the suite id in the path here, not the project id.
			const endpoint = `/api/v2/update_cases/${suiteId}`;
			await this.client.post(endpoint, { ...validatedData, case_ids: caseIds });
		} catch (error) {
			throw handleApiError(error, "Failed to update test cases");
		}
	}

	/**
	 * Deletes multiple test cases at once
	 * @param projectId The ID of the project, sent in the body as project_id
	 * @param suiteId The ID of the test suite, used as the path parameter
	 * @param caseIds Array of test case IDs to delete
	 */
	async deleteCases(
		projectId: GetTestCasesInput["projectId"],
		suiteId: number,
		caseIds: DeleteTestCaseInput["caseId"][],
	): Promise<void> {
		try {
			// Suite id in the path, same as update_cases, but delete_cases also
			// requires project_id in the body.
			const endpoint = `/api/v2/delete_cases/${suiteId}`;
			await this.client.post(endpoint, {
				project_id: projectId,
				case_ids: caseIds,
			});
		} catch (error) {
			throw handleApiError(error, "Failed to delete test cases");
		}
	}

	/**
	 * Imports a .feature file (Gherkin BDD scenario) into a TestRail section.
	 * Uses the dedicated add_bdd endpoint which is the only way to populate
	 * the custom_testrail_bdd_scenario field.
	 * @param sectionId The ID of the section
	 * @param featureContent Raw Gherkin .feature file content
	 * @returns Promise with created/updated test case
	 */
	async addBdd(sectionId: number, featureContent: string) {
		try {
			const FormData = (await import("form-data")).default;
			const form = new FormData();
			form.append("attachment", Buffer.from(featureContent, "utf-8"), {
				filename: "scenario.feature",
				contentType: "text/plain",
			});
			const response = await this.client.post(
				`/api/v2/add_bdd/${sectionId}`,
				form,
				{ headers: form.getHeaders() },
			);
			return response.data;
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to import BDD scenario to section ${sectionId}`,
			);
		}
	}

	/**
	 * Exports a BDD test case as a .feature file (Gherkin format).
	 * @param caseId The ID of the test case
	 * @returns Promise with raw Gherkin .feature content as string
	 */
	async getBdd(caseId: number) {
		try {
			const response = await this.client.get(`/api/v2/get_bdd/${caseId}`);
			return response.data;
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to export BDD scenario for case ${caseId}`,
			);
		}
	}
}
