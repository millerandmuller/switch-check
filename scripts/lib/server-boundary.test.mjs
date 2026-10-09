// The model key and everything that uses it stay on the server.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { root } from "./test-helpers.mjs";

async function files(dir, pattern) {
  const names = await readdir(`${root}${dir}`, { recursive: true });
  return names.filter((name) => pattern.test(name)).map((name) => `${dir}/${name}`);
}

const SERVER_ONLY = [/OPENROUTER_API_KEY/, /KV_REST_API/, /LIMIT_SALT/, /lib\/server/, /process\.env/];

test("no client component reads the environment or imports server code", async () => {
  const pages = await files("app", /\.tsx?$/);
  let clientFiles = 0;
  for (const name of pages) {
    const source = await readFile(`${root}${name}`, "utf8");
    if (!/^["']use client["']/m.test(source)) continue;
    clientFiles += 1;
    for (const pattern of SERVER_ONLY) assert.doesNotMatch(source, pattern, `${name} is a client file and matches ${pattern}`);
  }
  assert.ok(clientFiles > 0, "no client file found; the scan would pass on nothing");
});

test("only the routes and the page that reads config touch server code", async () => {
  const sources = await files("app", /\.tsx?$/);
  const offenders = [];
  for (const name of sources) {
    const source = await readFile(`${root}${name}`, "utf8");
    if (/lib\/server/.test(source) && !name.startsWith("app/api/")) offenders.push(name);
  }
  assert.deepEqual(offenders, []);
});

test("pure lib files never import server files", async () => {
  const pure = (await files("lib", /\.ts$/)).filter((name) => !name.startsWith("lib/server/"));
  for (const name of pure) {
    const source = await readFile(`${root}${name}`, "utf8");
    assert.doesNotMatch(source, /from ["'][^"']*server\//, `${name} imports server code`);
    assert.doesNotMatch(source, /process\.env|node:crypto|node:fs/, `${name} uses a server-only api`);
  }
});

test("the key is read in exactly one place", async () => {
  const all = [...(await files("app", /\.tsx?$/)), ...(await files("lib", /\.ts$/))];
  const readers = [];
  for (const name of all) {
    if (/process\.env\.OPENROUTER_API_KEY|env\.OPENROUTER_API_KEY/.test(await readFile(`${root}${name}`, "utf8"))) readers.push(name);
  }
  assert.deepEqual(readers, ["lib/server/services.ts"]);
});

test("the env example names the key with no value", async () => {
  const example = await readFile(`${root}.env.example`, "utf8");
  assert.match(example, /^OPENROUTER_API_KEY=$/m);
  assert.doesNotMatch(example, /sk-or-/);
});

test("no tracked text file holds a key", async () => {
  const targets = [...(await files("lib", /\.ts$/)), ...(await files("app", /\.tsx?$/)), ...(await files("config", /\.json$/)), ...(await files("docs", /\.md$/)), ...(await files("scripts", /\.mjs$/)), ...(await files("demo-data", /\.json$/))];
  const self = "scripts/lib/server-boundary.test.mjs";
  for (const name of targets) {
    if (name === self) continue;
    const source = await readFile(`${root}${name}`, "utf8");
    assert.doesNotMatch(source, /sk-or-v1-[0-9a-f]{20,}/, `${name} holds something shaped like a key`);
    assert.doesNotMatch(source, /Bearer\s+sk-/, `${name} holds a bearer token`);
  }
});
