// Integration tests for the HTTP API (#10): real server on an ephemeral port,
// NOTEAPI_FILE pointed at a temp file.
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Storage, type Note } from "../src/storage.js";
import { makeServer } from "../src/server.js";

const servers: Server[] = [];

async function boot(file: string): Promise<string> {
  const storage = await Storage.open(file);
  const server = makeServer(storage);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

async function tempStore(): Promise<string> {
  return path.join(await mkdtemp(path.join(os.tmpdir(), "noteapi-http-")), "notes.json");
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

describe("POST /notes + GET /notes/:id", () => {
  it("creates a note and fetches it back", async () => {
    const base = await boot(await tempStore());
    const created = await fetch(`${base}/notes`, {
      method: "POST",
      body: JSON.stringify({ title: "milk", body: "2%" }),
    });
    expect(created.status).toBe(201);
    const note = (await created.json()) as Note;
    expect(note.title).toBe("milk");
    expect(note.body).toBe("2%");
    expect(note.tags).toEqual([]);
    expect(note.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(note.createdAt).toISOString()).toBe(note.createdAt);

    const fetched = await fetch(`${base}/notes/${note.id}`);
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toEqual(note);
  });

  it("returns 404 with a JSON error for an unknown id", async () => {
    const base = await boot(await tempStore());
    const res = await fetch(`${base}/notes/no-such-id`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("rejects missing/empty title and malformed JSON with 400", async () => {
    const base = await boot(await tempStore());
    for (const body of ['{"body":"no title"}', '{"title":""}', '{"title":"  "}', "not json"]) {
      const res = await fetch(`${base}/notes`, { method: "POST", body });
      expect(res.status).toBe(400);
      const payload = (await res.json()) as { error: string };
      expect(typeof payload.error).toBe("string");
    }
  });

  it("defaults body to empty string when omitted", async () => {
    const base = await boot(await tempStore());
    const res = await fetch(`${base}/notes`, {
      method: "POST",
      body: JSON.stringify({ title: "just a title" }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as Note).body).toBe("");
  });

  it("persists notes across a server restart", async () => {
    const file = await tempStore();
    const base = await boot(file);
    const res = await fetch(`${base}/notes`, {
      method: "POST",
      body: JSON.stringify({ title: "durable", body: "still here" }),
    });
    const note = (await res.json()) as Note;

    const rebooted = await boot(file); // fresh Storage + server on the same file
    const fetched = await fetch(`${rebooted}/notes/${note.id}`);
    expect(fetched.status).toBe(200);
    expect(((await fetched.json()) as Note).body).toBe("still here");
  });
});
