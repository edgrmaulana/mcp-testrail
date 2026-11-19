import { describe, it, expect } from "vitest";
import {
	buildCasePayload,
	filterCaseColumns,
	selectFields,
	invalidFieldHint,
	parseOptionItems,
	decodeCustomOptions,
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

describe("selectFields", () => {
	it("returns the whole object when no fields are given", () => {
		expect(selectFields(testRailCase)).toEqual(testRailCase);
		expect(selectFields(testRailCase, [])).toEqual(testRailCase);
	});

	it("keeps only the requested keys", () => {
		expect(selectFields(testRailCase, ["id", "title", "refs"])).toEqual({
			id: 101,
			title: "User can log in",
			refs: "ANN-1234",
		});
	});

	it("ignores unknown keys instead of erroring", () => {
		expect(selectFields(testRailCase, ["id", "nope"])).toEqual({ id: 101 });
	});
});

describe("invalidFieldHint", () => {
	const fields = [
		{ system_name: "custom_mission", is_active: true },
		{ system_name: "custom_retired", is_active: false },
	];

	it("lists the active custom fields when TestRail names an invalid one", async () => {
		await expect(
			invalidFieldHint(
				new Error("Field :custom_nope is not a valid field."),
				async () => fields,
			),
		).resolves.toEqual(["custom_mission"]);
	});

	it("leaves other errors alone", async () => {
		await expect(
			invalidFieldHint(new Error("Section not found"), async () => fields),
		).resolves.toBeNull();
	});

	it("leaves the error alone when the field list itself fails", async () => {
		await expect(
			invalidFieldHint(
				new Error("Field :custom_nope is not a valid field."),
				async () => {
					throw new Error("down");
				},
			),
		).resolves.toBeNull();
	});
});

describe("parseOptionItems", () => {
	it("reads comma-separated options", () => {
		expect(parseOptionItems("1, Open\n2, Resolved")).toEqual(
			new Map([
				[1, "Open"],
				[2, "Resolved"],
			]),
		);
	});

	it("reads colon-separated options and skips text formats", () => {
		expect(parseOptionItems("1: Low\nA text format line\n3: High")).toEqual(
			new Map([
				[1, "Low"],
				[3, "High"],
			]),
		);
	});
});

describe("decodeCustomOptions", () => {
	const field = (
		override: Record<string, unknown> = {},
		items = "1, Manual\n3, No Need To Automated",
	) => ({
		id: 1,
		type_id: 6,
		name: "Automation Status",
		system_name: "custom_automation_status",
		label: "Automation Status",
		description: "",
		configs: [
			{
				id: "1",
				context: { is_global: false, project_ids: [24] },
				options: {
					default_value: "",
					format: "",
					is_required: "",
					rows: "",
					items,
				},
			},
		],
		display_order: 1,
		include_all: false,
		template_ids: [],
		is_active: true,
		status_id: 1,
		...override,
	});

	const testCase = {
		id: 37747,
		title: "Starter",
		section_id: 1,
		template_id: 4,
		type_id: 9,
		priority_id: 2,
		custom_automation_status: 3,
	} as never;

	it("decodes a project-scoped dropdown value", () => {
		expect(decodeCustomOptions([field()], testCase, 24)).toEqual({
			custom_automation_status: { id: 3, name: "No Need To Automated" },
		});
	});

	it("decodes multi-select arrays and unknown ids honestly", () => {
		const multi = { ...testCase, custom_platform: [1, 99] } as never;
		const platform = field(
			{ system_name: "custom_platform", template_ids: [] },
			"1, Web\n2, Mobile",
		);
		expect(decodeCustomOptions([field(), platform], multi, 24)).toEqual({
			custom_automation_status: { id: 3, name: "No Need To Automated" },
			custom_platform: [
				{ id: 1, name: "Web" },
				{ id: 99, name: null },
			],
		});
	});

	it("skips fields for other projects or templates", () => {
		const otherProject = field({
			configs: [
				{
					id: "1",
					context: { is_global: false, project_ids: [7] },
					options: {
						default_value: "",
						format: "",
						is_required: "",
						rows: "",
						items: "3, Automated",
					},
				},
			],
		});
		const otherTemplate = field({ template_ids: [2] });
		expect(
			decodeCustomOptions([otherProject, otherTemplate], testCase, 24),
		).toEqual({});
	});

	it("skips text fields with no options and null values", () => {
		const text = field({ system_name: "custom_notes" }, "");
		const unset = { ...testCase, custom_notes: null } as never;
		expect(decodeCustomOptions([text], unset, 24)).toEqual({});
	});

	it("prefers the project table over a global default listed first", () => {
		const globalFirst = field({
			configs: [
				{
					id: "1",
					context: { is_global: true, project_ids: [] },
					options: {
						default_value: "",
						format: "",
						is_required: "",
						rows: "",
						items: "3, Automated",
					},
				},
				{
					id: "2",
					context: { is_global: false, project_ids: [24] },
					options: {
						default_value: "",
						format: "",
						is_required: "",
						rows: "",
						items: "3, No Need To Automated",
					},
				},
			],
		});
		expect(decodeCustomOptions([globalFirst], testCase, 24)).toEqual({
			custom_automation_status: { id: 3, name: "No Need To Automated" },
		});
	});

	it("falls back to the global table when the project has none", () => {
		const globalOnly = field({
			configs: [
				{
					id: "1",
					context: { is_global: true, project_ids: [] },
					options: {
						default_value: "",
						format: "",
						is_required: "",
						rows: "",
						items: "3, Automated",
					},
				},
			],
		});
		expect(decodeCustomOptions([globalOnly], testCase, 24)).toEqual({
			custom_automation_status: { id: 3, name: "Automated" },
		});
	});

	it("survives a config missing items instead of failing the call", () => {
		const missingItems = field({
			configs: [
				{
					id: "1",
					context: { is_global: false, project_ids: [24] },
					options: undefined as never,
				},
			],
		});
		expect(decodeCustomOptions([missingItems], testCase, 24)).toEqual({});
	});
});
