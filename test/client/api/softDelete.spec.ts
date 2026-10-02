import { describe, it, expect, afterEach } from "vitest";
import { createServer, Server } from "node:http";
import { TestRailClient } from "../../../src/client/api/index.js";

// Shapes taken from a live TestRail instance (issue #10):
//
//   body {"soft":1}  -> {"cases":0}  and the section survives
//   query &soft=1    -> empty body   and the section is deleted
//   hard delete      -> empty body   and the section is deleted
//
// So a preview is identified by a non-empty payload, and an empty one means
// the section is gone.
let server: Server | undefined;

async function stub(reply: unknown) {
	const seen: { url: string; body: string }[] = [];
	server = createServer((req, res) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			seen.push({ url: req.url ?? "", body });
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(reply));
		});
	});
	await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	return { seen, port };
}

/** Serves a raw body, for responses that are not well-formed JSON. */
async function stubRaw(body: string, contentType: string) {
	server = createServer((_req, res) => {
		res.writeHead(200, { "Content-Type": contentType });
		res.end(body);
	});
	await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	return { port };
}

function clientFor(port: number) {
	return new TestRailClient({
		baseURL: `http://127.0.0.1:${port}/index.php?/`,
		auth: { username: "u", password: "k" },
	});
}

afterEach(async () => {
	await new Promise<void>((resolve) => {
		if (!server) return resolve();
		server.close(() => resolve());
	});
	server = undefined;
});

describe("deleteSection soft flag", () => {
	it("puts soft in the body and leaves the URL clean", async () => {
		const { seen, port } = await stub({ cases: 0 });

		await clientFor(port).sections.deleteSection(1089290, true);

		expect(seen[0].body).toBe(JSON.stringify({ soft: 1 }));
		// The destructive bug was `&soft=1` ending up here.
		expect(seen[0].url).toBe("/index.php?/api/v2/delete_section/1089290");
	});

	it("returns TestRail's affected-entity payload", async () => {
		const { port } = await stub({ cases: 12 });

		const result = await clientFor(port).sections.deleteSection(1089290, true);

		expect(result).toEqual({ cases: 12 });
	});

	it("sends an empty body for a hard delete", async () => {
		const { seen, port } = await stub({});

		await clientFor(port).sections.deleteSection(1089290);

		expect(seen[0].body).toBe(JSON.stringify({}));
		expect(seen[0].url).toBe("/index.php?/api/v2/delete_section/1089290");
	});

	it("returns an empty object when TestRail answers with no payload", async () => {
		// This is what the handler reads to tell a deletion from a preview.
		const { port } = await stub({});

		const result = await clientFor(port).sections.deleteSection(1089290);

		expect(result).toEqual({});
	});
});

describe("deleteSection payload normalization", () => {
	// Whatever is not a plain object has to become {}, or the handler's
	// "did I get a dry-run payload?" check misreads it. Object.keys() on an
	// HTML string counts its characters, so a login page would look like a
	// payload with dozens of fields.
	it("normalizes an HTML page served with a 200 to an empty object", async () => {
		const { port } = await stubRaw("<html>Login page</html>", "text/html");

		const result = await clientFor(port).sections.deleteSection(1089290, true);

		expect(result).toEqual({});
	});

	it("normalizes an empty body to an empty object", async () => {
		const { port } = await stubRaw("", "application/json");

		const result = await clientFor(port).sections.deleteSection(1089290);

		expect(result).toEqual({});
	});

	it("normalizes a JSON array to an empty object", async () => {
		const { port } = await stubRaw("[]", "application/json");

		const result = await clientFor(port).sections.deleteSection(1089290, true);

		expect(result).toEqual({});
	});

	it("keeps a real payload untouched", async () => {
		const { port } = await stubRaw('{"cases":7}', "application/json");

		const result = await clientFor(port).sections.deleteSection(1089290, true);

		expect(result).toEqual({ cases: 7 });
	});
});
