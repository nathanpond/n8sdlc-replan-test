// Unit tests for the SQLite persistence in src/storage.ts (node:sqlite),
// including the one-time legacy JSON import.
// test/** is exempt from the storage-boundary lint rule: proving persistence
// behavior requires inspecting the data file / database directly.
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Storage, type Note } from "../src/storage.js";

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "noteapi-"));
  // Nested, not-yet-existing parent to prove mkdir -p bootstrap.
  return path.join(dir, "nested");
}

async function tempStorePath(): Promise<string> {
  return path.join(await tempDir(), "notes.db");
}

function legacyJson(notes: Note[]): string {
  return JSON.stringify({
    version: 1,
    notes: Object.fromEntries(notes.map((n) => [n.id, n])),
  });
}

function note(id: string, title: string, createdAt: string): Note {
  return { id, title, body: `body of ${title}`, tags: [], createdAt };
}

describe("Storage (SQLite via node:sqlite)", () => {
  it("bootstraps a fresh database when the file is absent", async () => {
    const file = await tempStorePath();
    const storage = await Storage.open(file);
    expect(existsSync(file)).toBe(true);
    const created = await storage.createNote({ title: "first", body: "" });
    storage.close();

    // Inspect the database directly: the note is on disk, tags as JSON text.
    const db = new DatabaseSync(file);
    const rows = db.prepare("SELECT * FROM notes").all() as unknown as {
      id: string;
      tags: string;
    }[];
    db.close();
    expect(rows.map((r) => r.id)).toEqual([created.id]);
    expect(JSON.parse(rows[0]?.tags ?? "")).toEqual([]);
  });

  it("refuses to start on a file that is not a SQLite database, naming the path", async () => {
    const file = await tempStorePath();
    (await Storage.open(file)).close(); // create parent dir, then clobber
    await writeFile(file, "not a database {{{", "utf8");
    await expect(Storage.open(file)).rejects.toThrow(file);
    // The file was not overwritten.
    expect(await readFile(file, "utf8")).toBe("not a database {{{");
  });

  it("persists notes across close and reopen", async () => {
    const file = await tempStorePath();
    let storage = await Storage.open(file);
    const created = await storage.createNote({ title: "keep me", body: "b" });
    storage.close();
    storage = await Storage.open(file);
    expect(storage.getNote(created.id)?.title).toBe("keep me");
    storage.close();
  });
});

describe("legacy JSON import", () => {
  it("imports notes.json into an empty database and leaves the JSON file alone", async () => {
    const dir = await tempDir();
    const legacy = path.join(dir, "notes.json");
    const notes = [
      note("a-1", "oldest", "2026-01-01T00:00:00.000Z"),
      note("b-2", "tie-early", "2026-02-01T00:00:00.000Z"),
      note("c-3", "tie-late", "2026-02-01T00:00:00.000Z"),
    ];
    const json = legacyJson(notes);
    await mkdir(dir, { recursive: true });
    await writeFile(legacy, json, "utf8");

    const storage = await Storage.open(path.join(dir, "notes.db"));
    // Newest first; equal createdAt breaks to reverse insertion order.
    expect(storage.listNotes().map((n) => n.id)).toEqual(["c-3", "b-2", "a-1"]);
    expect(storage.getNote("a-1")?.body).toBe("body of oldest");
    storage.close();

    // The JSON file is byte-for-byte untouched.
    expect(await readFile(legacy, "utf8")).toBe(json);
  });

  it("does not import twice: a reopened (non-empty) database ignores notes.json", async () => {
    const dir = await tempDir();
    const dbFile = path.join(dir, "notes.db");
    (await Storage.open(dbFile)).close(); // creates dir
    await writeFile(
      path.join(dir, "notes.json"),
      legacyJson([note("a-1", "legacy", "2026-01-01T00:00:00.000Z")]),
      "utf8",
    );

    let storage = await Storage.open(dbFile); // empty DB -> import happens
    expect(storage.listNotes()).toHaveLength(1);
    storage.close();

    storage = await Storage.open(dbFile); // non-empty DB -> no re-import
    expect(storage.listNotes()).toHaveLength(1);
    storage.close();
  });

  it("skips the import when the database already has notes", async () => {
    const dir = await tempDir();
    const dbFile = path.join(dir, "notes.db");
    const storage = await Storage.open(dbFile);
    const own = await storage.createNote({ title: "already here", body: "" });
    storage.close();
    await writeFile(
      path.join(dir, "notes.json"),
      legacyJson([note("a-1", "legacy", "2026-01-01T00:00:00.000Z")]),
      "utf8",
    );

    const reopened = await Storage.open(dbFile);
    expect(reopened.listNotes().map((n) => n.id)).toEqual([own.id]);
    expect(reopened.getNote("a-1")).toBeUndefined();
    reopened.close();
  });

  it("refuses to start on a corrupt legacy JSON file, naming its path", async () => {
    const dir = await tempDir();
    const dbFile = path.join(dir, "notes.db");
    (await Storage.open(dbFile)).close(); // creates dir; DB stays empty
    const legacy = path.join(dir, "notes.json");
    await writeFile(legacy, "not json {{{", "utf8");
    await expect(Storage.open(dbFile)).rejects.toThrow(legacy);
    // The corrupt file was not modified.
    expect(await readFile(legacy, "utf8")).toBe("not json {{{");
  });

  it("refuses an unrecognized legacy shape", async () => {
    const dir = await tempDir();
    const dbFile = path.join(dir, "notes.db");
    (await Storage.open(dbFile)).close();
    const legacy = path.join(dir, "notes.json");
    await writeFile(legacy, JSON.stringify({ version: 99 }), "utf8");
    await expect(Storage.open(dbFile)).rejects.toThrow(legacy);
  });
});
