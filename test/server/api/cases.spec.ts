import { describe, it, expect } from "vitest";
import {
	buildCasePayload,
	filterCaseColumns,
} from "../../../src/server/api/cases.js";

// A row shaped like what TestRail's get_cases actually returns for a project
// that defines its own custom fields.
const testRailCase = {
	id: 101,
	title: "User can log in",
	section_id: 900,
	suite_id: 900,
	template_id: 2,
	type_id: 1,
	priority_id: 2,
	milestone_id: null,
	refs: "ANN-1234",
	estimate: "30s",
	display_order: 1,
	is_deleted: 0,
	status_id: 1,
	created_by: 5,
	created_on: 1700000000,
	updated_by: 5,
	updated_on: 1700000001,
	custom_business_unit: 3,
	custom_platform: [1, 2],
	custom_automation_type_new: 1,
	custom_preconds: "a very long preconditions body",
	custom_steps: "a very long steps body",
	custom_expected: "a very long expected body",
	custom_steps_separated: [{ content: "step", expected: "result" }],
};

describe("filterCaseColumns", () => {
	it("keeps the project's scalar custom fields", () => {
		const filtered = filterCaseColumns(testRailCase);

		expect(filtered.custom_business_unit).toBe(3);
		expect(filtered.custom_platform).toEqual([1, 2]);
		expect(filtered.custom_automation_type_new).toBe(1);
	});

	it("still drops the large text bodies", () => {
		const filtered = filterCaseColumns(testRailCase);

		expect(filtered).not.toHaveProperty("custom_preconds");
		expect(filtered).not.toHaveProperty("custom_steps");
		expect(filtered).not.toHaveProperty("custom_expected");
		expect(filtered).not.toHaveProperty("custom_steps_separated");
	});

	it("keeps the default columns", () => {
		const filtered = filterCaseColumns(testRailCase);

		expect(filtered.id).toBe(101);
		expect(filtered.title).toBe("User can log in");
		expect(filtered.section_id).toBe(900);
		expect(filtered.refs).toBe("ANN-1234");
		expect(filtered.milestone_id).toBeNull();
	});

	it("drops fields that are neither default columns nor custom", () => {
		const filtered = filterCaseColumns({
			...testRailCase,
			estimate_forecast: "1m",
			some_future_field: "noise",
		});

		expect(filtered).not.toHaveProperty("estimate_forecast");
		expect(filtered).not.toHaveProperty("some_future_field");
	});

	it("always includes id, even when the rest is missing", () => {
		expect(filterCaseColumns({ id: 7 })).toEqual({ id: 7 });
	});

	it("does not invent keys for absent default columns", () => {
		const filtered = filterCaseColumns({ id: 7, title: "Only a title" });

		expect(Object.keys(filtered).sort()).toEqual(["id", "title"]);
	});

	it("drops the BDD scenario body this server's addBdd writes", () => {
		const filtered = filterCaseColumns({
			id: 7,
			custom_testrail_bdd_scenario: "Feature: login\n  Scenario: ...",
		});

		expect(filtered).not.toHaveProperty("custom_testrail_bdd_scenario");
	});

	it("truncates a project's own long text field instead of dropping it", () => {
		// A "Text" custom field can be named anything, so only its length gives
		// it away. Truncating keeps "this field is set" readable for an audit.
		const body = "x".repeat(5000);
		const filtered = filterCaseColumns({ id: 7, custom_mission: body });

		const value = filtered.custom_mission as string;
		expect(value).toMatch(/\[truncated, use getCase for the full value\]$/);
		expect(value.length).toBeLessThan(350);
		expect(value.startsWith("x".repeat(250))).toBe(true);
	});

	it("leaves a string custom field at the 250-character cap untouched", () => {
		const atCap = "y".repeat(250);
		const filtered = filterCaseColumns({ id: 7, custom_owner_note: atCap });

		expect(filtered.custom_owner_note).toBe(atCap);
	});

	it("never truncates non-string custom values", () => {
		const filtered = filterCaseColumns({
			id: 7,
			custom_platform: [1, 2, 3],
			custom_business_unit: 3,
			custom_is_regression: true,
			custom_unset: null,
		});

		expect(filtered.custom_platform).toEqual([1, 2, 3]);
		expect(filtered.custom_business_unit).toBe(3);
		expect(filtered.custom_is_regression).toBe(true);
		expect(filtered.custom_unset).toBeNull();
	});
});

// Project-defined custom fields have no named parameter, so customFields is the
// only path to a field TestRail marks required (issue #14). These pin that path
// and the one place it must not behave like a named parameter.
describe("buildCasePayload", () => {
	it("maps named parameters to TestRail's field names", () => {
		const data = buildCasePayload({
			title: "User can log in",
			typeId: 1,
			customPrerequisites: "logged out",
			customSteps: "tap login",
		});

		expect(data).toEqual({
			title: "User can log in",
			type_id: 1,
			custom_preconds: "logged out",
			custom_steps: "tap login",
		});
	});

	it("passes project-defined custom fields through verbatim", () => {
		const data = buildCasePayload({
			title: "Case",
			customFields: { custom_business_unit: 5, custom_automation_type_new: 7 },
		});

		expect(data).toEqual({
			title: "Case",
			custom_business_unit: 5,
			custom_automation_type_new: 7,
		});
	});

	it("sends a custom field the caller deliberately cleared", () => {
		// An omitted named parameter must not blank a stored value, but a custom
		// field the caller set to "" or null is an explicit clear and has to reach
		// TestRail; the old per-handler strip loop dropped both.
		const data = buildCasePayload({
			customFields: { custom_notes: "", custom_owner: null },
		});

		expect(data).toEqual({ custom_notes: "", custom_owner: null });
	});

	it("omits named parameters that were not supplied", () => {
		expect(buildCasePayload({ title: "Only a title" })).toEqual({
			title: "Only a title",
		});
	});

	it("ignores a zero custom field value only when named", () => {
		// typeId: 0 is not a valid TestRail id, but custom_business_unit: 0 can be
		// a real option value, so customFields keeps it.
		expect(
			buildCasePayload({ typeId: 0, customFields: { custom_bu: 0 } }),
		).toEqual({ custom_bu: 0 });
	});
});
