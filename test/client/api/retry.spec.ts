import { describe, it, expect, afterEach } from "vitest";
import { createServer, Server } from "node:http";
import {
	retryDelayMs,
	MAX_RETRY_DELAY_MS,
} from "../../../src/client/api/baseClient.js";
import { TestRailClient } from "../../../src/client/api/index.js";

// These tests run against a real local HTTP server rather than a mocked axios,
// because the retry lives in an axios interceptor. Stubbed 429s mostly answer
// with "Retry-After: 0" to keep the suite quick; the two cases that assert a
// real wait say so.
type Reply = { status: number; body: unknown; retryAfter?: string };

let server: Server | undefined;

/** Starts a stub that answers with each reply in turn, then repeats the last. */
async function stub(replies: Reply[]) {
	const paths: string[] = [];
	server = createServer((req, res) => {
		const reply = replies[Math.min(paths.length, replies.length - 1)];
		paths.push(req.url ?? "");
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (reply.retryAfter !== undefined) {
			headers["Retry-After"] = reply.retryAfter;
		}
		res.writeHead(reply.status, headers);
		res.end(JSON.stringify(reply.body));
	});
	await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	return { paths, port };
}

function clientFor(port: number, maxRetries?: number) {
	return new TestRailClient({
		baseURL: `http://127.0.0.1:${port}/index.php?/`,
		auth: { username: "u", password: "k" },
		maxRetries,
	});
}

const RATE_LIMITED = {
	status: 429,
	body: {
		error:
			"API Rate Limit Exceeded - 180 per minute maximum allowed. Retry after 6 seconds.",
	},
	retryAfter: "0",
};

afterEach(() => {
	server?.close();
	server = undefined;
});

describe("429 retry", () => {
	it("retries a read and returns the eventual success", async () => {
		const { paths, port } = await stub([
			RATE_LIMITED,
			{ status: 200, body: { id: 605121, title: "Recovered" } },
		]);

		const testCase = await clientFor(port).cases.getCase(605121);

		expect(testCase.title).toBe("Recovered");
		expect(paths.length).toBe(2);
	});

	it("retries a write too, since that is where a mid-batch failure hurts", async () => {
		const { paths, port } = await stub([
			RATE_LIMITED,
			{ status: 200, body: { id: 1, title: "Created" } },
		]);

		const created = await clientFor(port).cases.addCase(74790, {
			title: "Created",
		});

		expect(created.title).toBe("Created");
		expect(paths.length).toBe(2);
	});

	it("gives up after maxRetries and surfaces TestRail's own message", async () => {
		const { paths, port } = await stub([RATE_LIMITED]);

		await expect(clientFor(port, 2).cases.getCase(605121)).rejects.toThrow(
			/API Rate Limit Exceeded/,
		);
		// The first attempt plus two retries.
		expect(paths.length).toBe(3);
	});

	it("does not retry a non-429 error", async () => {
		const { paths, port } = await stub([
			{ status: 400, body: { error: "Field :title is a required field" } },
		]);

		await expect(clientFor(port).cases.getCase(605121)).rejects.toThrow(
			/required field/,
		);
		expect(paths.length).toBe(1);
	});

	it("does not retry a stream body, and surfaces the 429 straight away", async () => {
		// addBdd posts form-data, which is a stream the first attempt consumes.
		// Re-sending the spent config never reaches the server and dies with
		// "socket hang up" after the timeout, so the rate-limit error is better.
		const { paths, port } = await stub([RATE_LIMITED]);

		await expect(
			clientFor(port).cases.addBdd(74790, "Feature: login\n"),
		).rejects.toThrow(/API Rate Limit Exceeded/);
		expect(paths.length).toBe(1);
	});

	it("retries with a real wait when only the body states the delay", async () => {
		// No Retry-After header at all: the delay has to come from the body.
		const { paths, port } = await stub([
			{
				status: 429,
				body: { error: "API Rate Limit Exceeded. Retry after 1 seconds." },
			},
			{ status: 200, body: { id: 1, title: "Recovered" } },
		]);

		const started = Date.now();
		const testCase = await clientFor(port).cases.getCase(605121);

		expect(testCase.title).toBe("Recovered");
		expect(paths.length).toBe(2);
		expect(Date.now() - started).toBeGreaterThanOrEqual(900);
	});

	it("gives up rather than waiting out an absurd Retry-After", async () => {
		const { paths, port } = await stub([
			{ ...RATE_LIMITED, retryAfter: "86400" },
		]);

		const started = Date.now();
		await expect(clientFor(port).cases.getCase(605121)).rejects.toThrow(
			/API Rate Limit Exceeded/,
		);

		expect(paths.length).toBe(1);
		// Returns immediately instead of sleeping, let alone three times over.
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it("keeps the retried request on the same URL", async () => {
		const { paths, port } = await stub([
			RATE_LIMITED,
			{ status: 200, body: { id: 1 } },
		]);

		await clientFor(port).cases.getCase(605121);

		expect(paths[0]).toBe(paths[1]);
		expect(paths[0]).toContain("/api/v2/get_case/605121");
	});
});

describe("retryDelayMs", () => {
	it("honours the Retry-After header in seconds", () => {
		expect(retryDelayMs({ headers: { "retry-after": "6" }, data: {} }, 1)).toBe(
			6000,
		);
	});

	it("reads the delay out of TestRail's error body when no header is sent", () => {
		// TestRail's docs promise a Retry-After header, but instances have been
		// seen answering without one.
		expect(
			retryDelayMs(
				{
					headers: {},
					data: {
						error:
							"API Rate Limit Exceeded - 180 per minute maximum allowed. Retry after 6 seconds.",
					},
				},
				1,
			),
		).toBe(6000);
	});

	it("prefers the header over the body", () => {
		expect(
			retryDelayMs(
				{
					headers: { "retry-after": "2" },
					data: { error: "Retry after 30 seconds." },
				},
				1,
			),
		).toBe(2000);
	});

	it("backs off exponentially when neither says anything", () => {
		const first = retryDelayMs({ headers: {}, data: {} }, 1);
		const third = retryDelayMs({ headers: {}, data: {} }, 3);

		// Jitter adds up to 250ms on top of 1s, 2s, 4s.
		expect(first).toBeGreaterThanOrEqual(1000);
		expect(first).toBeLessThan(1250);
		expect(third).toBeGreaterThanOrEqual(4000);
		expect(third).toBeLessThan(4250);
	});

	it("reports an absurd Retry-After as-is, for the caller to reject", () => {
		// Capping here would have meant waiting 60s per attempt, three times
		// over; the interceptor gives up instead.
		const delay = retryDelayMs(
			{ headers: { "retry-after": "86400" }, data: {} },
			1,
		);

		expect(delay).toBe(86_400_000);
		expect(delay).toBeGreaterThan(MAX_RETRY_DELAY_MS);
	});

	it("ignores a blank or negative Retry-After instead of reading it as zero", () => {
		// Number("") is 0 and finite, so a bare guard would retry with no wait
		// and throw away the delay the body states.
		for (const header of ["", "   ", "-5"]) {
			expect(
				retryDelayMs(
					{
						headers: { "retry-after": header },
						data: { error: "Retry after 6 seconds." },
					},
					1,
				),
			).toBe(6000);
		}
	});

	it("still honours an explicit Retry-After of zero", () => {
		expect(retryDelayMs({ headers: { "retry-after": "0" }, data: {} }, 1)).toBe(
			0,
		);
	});

	it("treats a non-numeric Retry-After as absent", () => {
		// An HTTP-date Retry-After is legal but TestRail sends seconds; falling
		// through to the body or backoff beats waiting NaN milliseconds.
		expect(
			retryDelayMs(
				{
					headers: { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" },
					data: { error: "Retry after 3 seconds." },
				},
				1,
			),
		).toBe(3000);
	});
});
