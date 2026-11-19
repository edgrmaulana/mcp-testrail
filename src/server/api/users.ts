import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TestRailClient } from "../../client/api/index.js";
import {
	createSuccessResponse,
	createErrorResponse,
	paginateArray,
	registerStrictTool,
} from "./utils.js";
import { getUsersSchema, getUserSchema } from "../../shared/schemas/users.js";

/**
 * Function to register user-related API tools
 * @param server McpServer instance
 * @param testRailClient TestRail client instance
 */
export function registerUserTools(
	server: McpServer,
	testRailClient: TestRailClient,
): void {
	// Get all users
	registerStrictTool(
		server,
		"getUsers",
		"Retrieves all TestRail users, decoding assignedto_id and created_by into names and emails. OPTIONAL: limit, offset; repeat with offset advanced by limit while pagination.hasMore is true.",
		getUsersSchema,
		async (args) => {
			try {
				const users = await testRailClient.users.getUsers();
				const { page, pagination } = paginateArray(
					users,
					args.limit,
					args.offset,
				);
				return createSuccessResponse("Users retrieved successfully", {
					users: page,
					pagination,
				});
			} catch (error) {
				return createErrorResponse("Error fetching users", error);
			}
		},
	);

	// Get a specific user by ID
	registerStrictTool(
		server,
		"getUser",
		"Retrieves details of a specific TestRail user by ID",
		getUserSchema,
		async (args) => {
			try {
				const user = await testRailClient.users.getUser(args.userId);
				return createSuccessResponse("User retrieved successfully", {
					user,
				});
			} catch (error) {
				return createErrorResponse(`Error fetching user ${args.userId}`, error);
			}
		},
	);
}
