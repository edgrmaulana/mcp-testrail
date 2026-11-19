import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupMocks, createTestClient } from "./testHelper";

vi.mock("axios");

describe("Users API", () => {
	let mockAxiosInstance: ReturnType<typeof setupMocks>;
	let client: ReturnType<typeof createTestClient>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockAxiosInstance = setupMocks();
		client = createTestClient();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("retrieves all users", async () => {
		const users = [
			{ id: 1, name: "Ada", email: "ada@example.com", is_active: true },
		];
		mockAxiosInstance.get.mockResolvedValue({ data: users });

		await expect(client.users.getUsers()).resolves.toEqual(users);
		expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v2/get_users");
	});

	it("retrieves a single user", async () => {
		const user = {
			id: 68,
			name: "Bob",
			email: "bob@example.com",
			is_active: true,
		};
		mockAxiosInstance.get.mockResolvedValue({ data: user });

		await expect(client.users.getUser(68)).resolves.toEqual(user);
		expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v2/get_user/68");
	});
});
