import { z } from "zod";

// Schema for retrieving all users
export const getUsersSchema = {
	limit: z
		.number()
		.min(1)
		.optional()
		.describe("Maximum users to return (omitted: all)"),
	offset: z.number().optional().describe("Users to skip (default 0)"),
};

// Schema for retrieving a specific user
export const getUserSchema = {
	userId: z.number().describe("TestRail User ID"),
};

// Create Zod objects from each schema
export const GetUsersInput = z.object(getUsersSchema);
export const GetUserInput = z.object(getUserSchema);

// Extract input types
export type GetUsersInputType = z.infer<typeof GetUsersInput>;
export type GetUserInputType = z.infer<typeof GetUserInput>;

// -----------------------------------------------
// Response schema definitions
// -----------------------------------------------

/**
 * TestRail API Response for User
 */
export const TestRailUserSchema = z.object({
	id: z.number(),
	name: z.string(),
	email: z.string(),
	is_active: z.boolean(),
});
export type TestRailUser = z.infer<typeof TestRailUserSchema>;
