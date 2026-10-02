import { BaseTestRailClient } from "./baseClient.js";
import { TestRailSection } from "../../shared/schemas/sections.js";
import { handleApiError } from "./utils.js";
import {
	GetSectionInputType,
	GetSectionsInputType,
	AddSectionInputType,
	MoveSectionInputType,
	UpdateSectionInputType,
	DeleteSectionInputType,
} from "../../shared/schemas/sections.js";

export class SectionsClient extends BaseTestRailClient {
	/**
	 * Get a specific section
	 */
	async getSection(
		sectionId: GetSectionInputType["sectionId"],
	): Promise<TestRailSection> {
		try {
			const response = await this.client.get<TestRailSection>(
				`/api/v2/get_section/${sectionId}`,
			);
			return response.data;
		} catch (error) {
			throw handleApiError(error, `Failed to get section ${sectionId}`);
		}
	}

	/**
	 * Get sections for a project with pagination support.
	 * Returns a single page of sections along with pagination metadata,
	 * allowing the caller to control how much data to fetch per request.
	 */
	async getSections(
		projectId: GetSectionsInputType["projectId"],
		suiteId?: GetSectionsInputType["suiteId"],
		params?: {
			limit?: number;
			offset?: number;
		},
	): Promise<{
		sections: TestRailSection[];
		offset: number;
		limit: number;
		size: number;
		_links: { next: string | null; prev: string | null };
	}> {
		try {
			const url = `/api/v2/get_sections/${projectId}`;
			const defaultParams = {
				limit: 250,
				offset: 0,
				...params,
			};
			const queryParams = suiteId
				? { ...defaultParams, suite_id: suiteId }
				: defaultParams;

			const response = await this.client.get<{
				offset: number;
				limit: number;
				size: number;
				_links: { next: string | null; prev: string | null };
				sections: TestRailSection[];
			}>(url, { params: queryParams });

			return response.data;
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to get sections for project ${projectId}`,
			);
		}
	}

	/**
	 * Add a new section
	 */
	async addSection(
		projectId: AddSectionInputType["projectId"],
		data: {
			name: AddSectionInputType["name"];
			description?: AddSectionInputType["description"];
			suite_id?: AddSectionInputType["suiteId"];
			parent_id?: AddSectionInputType["parentId"];
		},
	): Promise<TestRailSection> {
		try {
			const response = await this.client.post<TestRailSection>(
				`/api/v2/add_section/${projectId}`,
				data,
			);
			return response.data;
		} catch (error) {
			throw handleApiError(
				error,
				`Failed to add section to project ${projectId}`,
			);
		}
	}

	/**
	 * Move a section to a different parent or position
	 */
	async moveSection(
		sectionId: MoveSectionInputType["sectionId"],
		data: {
			parent_id?: MoveSectionInputType["parentId"];
			after_id?: MoveSectionInputType["afterId"];
		},
	): Promise<TestRailSection> {
		try {
			const response = await this.client.post<TestRailSection>(
				`/api/v2/move_section/${sectionId}`,
				data,
			);
			return response.data;
		} catch (error) {
			throw handleApiError(error, `Failed to move section ${sectionId}`);
		}
	}

	/**
	 * Update an existing section
	 */
	async updateSection(
		sectionId: UpdateSectionInputType["sectionId"],
		data: {
			name?: UpdateSectionInputType["name"];
			description?: UpdateSectionInputType["description"];
		},
	): Promise<TestRailSection> {
		try {
			const response = await this.client.post<TestRailSection>(
				`/api/v2/update_section/${sectionId}`,
				data,
			);
			return response.data;
		} catch (error) {
			throw handleApiError(error, `Failed to update section ${sectionId}`);
		}
	}

	/**
	 * Deletes a section, or reports what deleting it would affect.
	 *
	 * `soft` has to travel in the POST body. TestRail ignores it as a query
	 * parameter and deletes the section for real, which is how a request for a
	 * preview destroyed one. Verified against a live instance: body `{soft: 1}`
	 * answers `{"cases": 0}` and leaves the section in place, while `&soft=1`
	 * answers with an empty body and removes it.
	 * @param sectionId The ID of the section
	 * @param soft True to preview the deletion instead of performing it
	 * @returns The affected-entity counts for a preview, or an empty object
	 */
	async deleteSection(
		sectionId: DeleteSectionInputType["sectionId"],
		soft?: DeleteSectionInputType["soft"],
	): Promise<Record<string, unknown>> {
		try {
			const url = `/api/v2/delete_section/${sectionId}`;

			const response = await this.client.post(url, soft ? { soft: 1 } : {});

			// A real deletion answers with an empty body, which axios hands back as
			// "", and anything unparseable (a login or maintenance page served with
			// a 200) arrives as its raw string. Both have to normalize to {} or the
			// caller cannot tell a dry-run payload from no payload: Object.keys()
			// on an HTML string counts its characters.
			const data: unknown = response.data;
			return typeof data === "object" && data !== null && !Array.isArray(data)
				? (data as Record<string, unknown>)
				: {};
		} catch (error) {
			throw handleApiError(error, `Failed to delete section ${sectionId}`);
		}
	}
}
