// The persistence boundary (see the storage-boundary invariant): this is the
// only module allowed to touch the filesystem. All data lives in one JSON file
// `{ "version": 1, "notes": { "<id>": Note } }`, loaded once into memory;
// every mutation rewrites the whole file atomically (tmp + rename).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string; // ISO-8601
}

interface StoreFile {
  version: 1;
  notes: Record<string, Note>;
}

function isStoreFile(value: unknown): value is StoreFile {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    typeof (value as { notes?: unknown }).notes === "object" &&
    (value as { notes?: unknown }).notes !== null
  );
}

export class Storage {
  private constructor(
    private readonly file: string,
    private readonly notes: Map<string, Note>,
  ) {}

  /**
   * Open the store at `file`. A missing file bootstraps an empty store (parent
   * directory created); a file that exists but cannot be parsed is a hard
   * startup error naming the path — user data is never silently overwritten.
   */
  static async open(file: string): Promise<Storage> {
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      await mkdir(path.dirname(file), { recursive: true });
      const storage = new Storage(file, new Map());
      await storage.persist();
      return storage;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `noteapi store at ${file} is not valid JSON (${(err as Error).message}); refusing to overwrite it`,
        { cause: err },
      );
    }
    if (!isStoreFile(parsed)) {
      throw new Error(
        `noteapi store at ${file} has an unrecognized shape; refusing to overwrite it`,
      );
    }
    return new Storage(file, new Map(Object.entries(parsed.notes)));
  }

  /** Atomic whole-store write: serialize → `<file>.tmp` (same dir) → rename. */
  private async persist(): Promise<void> {
    const data: StoreFile = { version: 1, notes: Object.fromEntries(this.notes) };
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, this.file);
  }

  async createNote(input: { title: string; body: string }): Promise<Note> {
    const note: Note = {
      id: randomUUID(),
      title: input.title,
      body: input.body,
      tags: [],
      createdAt: new Date().toISOString(),
    };
    this.notes.set(note.id, note);
    await this.persist();
    return note;
  }

  getNote(id: string): Note | undefined {
    return this.notes.get(id);
  }

  /** Remove a note permanently; returns false when the id is unknown. */
  async deleteNote(id: string): Promise<boolean> {
    if (!this.notes.delete(id)) return false;
    await this.persist();
    return true;
  }

  /**
   * All notes, newest first (createdAt descending). Tie-break: most recently
   * created first — reverse insertion order, which the JSON file's key order
   * preserves across reloads.
   */
  listNotes(): Note[] {
    return [...this.notes.values()]
      .reverse() // stable sort keeps reverse-insertion order within equal timestamps
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0));
  }
}
