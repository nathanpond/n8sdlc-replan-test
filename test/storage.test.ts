// Unit tests for the JSON-file persistence prescribed by #11.
// test/** is exempt from the storage-boundary lint rule: proving persistence
// behavior requires inspecting the data file directly.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Storage } from "../src/storage.js";

async function tempStorePath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "noteapi-"));
  // Nested, not-yet-existing parent to prove mkdir -p bootstrap.
  return path.join(dir, "nested", "notes.json");
}

describe("Storage (JSON file, atomic writes)", () => {
  it("bootstraps a fresh store when the file is absent", async () => {
    const file = await tempStorePath();
    const storage = await Storage.open(file);
    expect(existsSync(file)).toBe(true);
    const note = await storage.createNote({ title: "first", body: "" });
    const onDisk = JSON.parse(await readFile(file, "utf8")) as {
      version: number;
      notes: Record<string, unknown>;
    };
    expect(onDisk.version).toBe(1);
    expect(Object.keys(onDisk.notes)).toEqual([note.id]);
  });

  it("refuses to start on a corrupt file, naming the path", async () => {
    const file = await tempStorePath();
    await Storage.open(file); // create parent dir + empty store
    await writeFile(file, "not json {{{", "utf8");
    await expect(Storage.open(file)).rejects.toThrow(file);
    // The corrupt file was not overwritten.
    expect(await readFile(file, "utf8")).toBe("not json {{{");
  });

  it("refuses to start on an unrecognized shape", async () => {
    const file = await tempStorePath();
    await Storage.open(file);
    await writeFile(file, JSON.stringify({ version: 99 }), "utf8");
    await expect(Storage.open(file)).rejects.toThrow(file);
  });

  it("survives a simulated interrupted write (stale tmp, target intact)", async () => {
    const file = await tempStorePath();
    let storage = await Storage.open(file);
    const note = await storage.createNote({ title: "keep me", body: "b" });
    // Simulate a crash mid-write: a garbage tmp file next to an intact target.
    await writeFile(`${file}.tmp`, "garbage-from-interrupted-write", "utf8");
    storage = await Storage.open(file);
    expect(storage.getNote(note.id)?.title).toBe("keep me");
    // The next persist goes through tmp+rename and leaves valid JSON.
    const second = await storage.createNote({ title: "second", body: "" });
    const onDisk = JSON.parse(await readFile(file, "utf8")) as {
      notes: Record<string, unknown>;
    };
    expect(Object.keys(onDisk.notes).sort()).toEqual([note.id, second.id].sort());
  });
});
