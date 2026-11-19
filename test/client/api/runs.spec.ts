import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupMocks, createTestClient } from "./testHelper";

describe("Runs API", () => {
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

	it("retrieves a specific run", async () => {
		// Mock response
		const mockRun = {
			id: 1,
			name: "Test Run 1",
			description: "Description for test run 1",
			suite_id: 1,
			milestone_id: 1,
			assignedto_id: 1,
			include_all: true,
			is_completed: false,
			completed_on: null,
			passed_count: 5,
			blocked_count: 0,
			untested_count: 5,
			retest_count: 0,
			failed_count: 0,
			created_on: 1609459200,
			created_by: 1,
			url: "http://example.com/run/1",
		};
		mockAxiosInstance.get.mockResolvedValue({ data: mockRun });

		// Test method
		const result = await client.runs.getRun(1);

		// Verify axios get was called correctly
		expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v2/get_run/1");

		// Verify result
		expect(result).toEqual(mockRun);
	});

	it("handles errors when retrieving a specific run", async () => {
		// Mock error response (404 - run not found)
		const mockError = {
			response: {
				status: 404,
				data: { error: "Run not found" },
			},
		};
		mockAxiosInstance.get.mockRejectedValue(mockError);

		// Test error handling
		await expect(client.runs.getRun(999)).rejects.toThrow();

		// Verify axios get was called correctly
		expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v2/get_run/999");
	});

	it("retrieves all runs for a project", async () => {
		// Mock response
		const mockRuns = [
			{
				id: 1,
				name: "Test Run 1",
				description: "Description for test run 1",
				suite_id: 1,
				milestone_id: 1,
				is_completed: false,
				url: "http://example.com/run/1",
			},
			{
				id: 2,
				name: "Test Run 2",
				description: "Description for test run 2",
				suite_id: 1,
				milestone_id: 1,
				is_completed: true,
				url: "http://example.com/run/2",
			},
		];
		mockAxiosInstance.get.mockResolvedValue({ data: mockRuns });

		// Test method
		const result = await client.runs.getRuns(1);

		// Verify axios get was called correctly
		expect(mockAxiosInstance.get).toHaveBeenCalledWith(
			"/api/v2/get_runs/1",
			expect.anything(),
		);

		// Verify result
		expect(result).toEqual(mockRuns);
	});

	it("retrieves runs with filter parameters", async () => {
		// Mock response
		const mockRuns = [
			{
				id: 1,
				name: "Test Run 1",
				suite_id: 1,
				milestone_id: 5,
				is_completed: false,
				url: "http://example.com/run/1",
			},
		];
		mockAxiosInstance.get.mockResolvedValue({ data: mockRuns });

		// Test method with filters
		const filters = { milestone_id: 5, is_completed: 0 };
		const result = await client.runs.getRuns(1, filters);

		// Verify axios get was called correctly with query parameters
		expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v2/get_runs/1", {
			params: filters,
		});

		// Verify result
		expect(result).toEqual(mockRuns);
	});

	it("creates a new run", async () => {
		// Mock response
		const mockRun = {
			id: 3,
			name: "New Test Run",
			description: "Description for new test run",
			suite_id: 1,
			milestone_id: 1,
			assignedto_id: 1,
			include_all: false,
			case_ids: [1, 2, 3],
			is_completed: false,
			created_on: 1619827200,
			created_by: 1,
			url: "http://example.com/run/3",
		};
		mockAxiosInstance.post.mockResolvedValue({ data: mockRun });

		// Test data
		const runData = {
			name: "New Test Run",
			description: "Description for new test run",
			suite_id: 1,
			milestone_id: 1,
			assignedto_id: 1,
			include_all: false,
			case_ids: [1, 2, 3],
		};

		// Test method
		const result = await client.runs.addRun(1, runData);

		// Verify axios post was called correctly
		expect(mockAxiosInstance.post).toHaveBeenCalledWith(
			"/api/v2/add_run/1",
			runData,
		);

		// Verify result
		expect(result).toEqual(mockRun);
	});

	it("updates an existing run", async () => {
		// Mock response
		const mockRun = {
			id: 1,
			name: "Updated Test Run",
			description: "Updated description",
			milestone_id: 2,
			include_all: true,
			is_completed: false,
			url: "http://example.com/run/1",
		};
		mockAxiosInstance.post.mockResolvedValue({ data: mockRun });

		// Test data
		const runData = {
			name: "Updated Test Run",
			description: "Updated description",
			milestone_id: 2,
			include_all: true,
		};

		// Test method
		const result = await client.runs.updateRun(1, runData);

		// Verify axios post was called correctly
		expect(mockAxiosInstance.post).toHaveBeenCalledWith(
			"/api/v2/update_run/1",
			runData,
		);

		// Verify result
		expect(result).toEqual(mockRun);
	});

	it("deletes a test run", async () => {
		mockAxiosInstance.post.mockResolvedValue({ data: {} });

		await client.runs.deleteRun(5);

		expect(mockAxiosInstance.post).toHaveBeenCalledWith(
			"/api/v2/delete_run/5",
			{},
		);
	});

	it("closes a test run", async () => {
		const closed = { id: 5, name: "Nightly", is_completed: true };
		mockAxiosInstance.post.mockResolvedValue({ data: closed });

		await expect(client.runs.closeRun(5)).resolves.toEqual(closed);
		expect(mockAxiosInstance.post).toHaveBeenCalledWith(
			"/api/v2/close_run/5",
			{},
		);
	});

	it("lists a project's configuration groups", async () => {
		const groups = [
			{ id: 1, name: "OS", project_id: 24, configs: [{ id: 2, name: "iOS" }] },
		];
		mockAxiosInstance.get.mockResolvedValue({ data: groups });

		await expect(client.runs.getConfigurations(24)).resolves.toEqual(groups);
		expect(mockAxiosInstance.get).toHaveBeenCalledWith(
			"/api/v2/get_configs/24",
		);
	});
});
