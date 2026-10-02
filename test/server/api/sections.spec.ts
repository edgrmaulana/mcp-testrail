import { describe, it, expect } from "vitest";
import { describeSectionDeletion } from "../../../src/server/api/sections.js";

// Deleting a section is irreversible and cascades to its test cases, so these
// branches are the ones standing between a caller asking "what would this
// destroy?" and being told nothing happened when something did.
function payloadOf(result: { content: unknown }) {
	const content = result.content as [{ text: string }];
	return JSON.parse(content[0].text);
}

describe("describeSectionDeletion", () => {
	it("reports a preview with TestRail's affected counts", () => {
		const result = describeSectionDeletion(1089290, true, { cases: 12 });

		expect(result.isError).toBeUndefined();
		expect(payloadOf(result)).toEqual({
			message: "Section 1089290 was previewed, not deleted",
			affected: { cases: 12 },
		});
	});

	it("treats zero affected cases as a valid preview", () => {
		// A live instance answers {"cases": 0} for an empty section, which is a
		// real preview and must not be mistaken for "no payload".
		const result = describeSectionDeletion(1089290, true, { cases: 0 });

		expect(result.isError).toBeUndefined();
		expect(payloadOf(result).message).toContain("was previewed, not deleted");
	});

	it("refuses to call an empty payload a successful preview", () => {
		const result = describeSectionDeletion(1089290, true, {});

		expect(result.isError).toBe(true);
		expect(payloadOf(result).error).toContain("may have been deleted");
	});

	it("never claims a preview happened when none was asked for", () => {
		const result = describeSectionDeletion(1089290, undefined, {});

		expect(result.isError).toBeUndefined();
		expect(payloadOf(result)).toEqual({
			message: "Section 1089290 deleted successfully",
		});
	});

	it("reports a hard delete plainly even if TestRail sends a payload", () => {
		const result = describeSectionDeletion(1089290, false, { cases: 3 });

		expect(result.isError).toBeUndefined();
		expect(payloadOf(result).message).toBe(
			"Section 1089290 deleted successfully",
		);
	});
});
