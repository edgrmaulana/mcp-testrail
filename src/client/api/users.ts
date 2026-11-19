import { BaseTestRailClient } from "./baseClient.js";
import { TestRailUser, GetUserInputType } from "../../shared/schemas/users.js";
import { handleApiError } from "./utils.js";

export class UsersClient extends BaseTestRailClient {
	/**
	 * Get all users. TestRail returns the whole directory in one page;
	 * callers page client-side.
	 */
	async getUsers(): Promise<TestRailUser[]> {
		try {
			const response =
				await this.client.get<TestRailUser[]>("/api/v2/get_users");
			return response.data;
		} catch (error) {
			throw handleApiError(error, "Failed to get users");
		}
	}

	/**
	 * Get a specific user, decoding an assignedto_id or created_by
	 * into a name and email.
	 * @param userId The ID of the user
	 */
	async getUser(userId: GetUserInputType["userId"]): Promise<TestRailUser> {
		try {
			const response = await this.client.get<TestRailUser>(
				`/api/v2/get_user/${userId}`,
			);
			return response.data;
		} catch (error) {
			throw handleApiError(error, `Failed to get user ${userId}`);
		}
	}
}
