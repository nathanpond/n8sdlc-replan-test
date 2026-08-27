// The persistence boundary (see the storage-boundary invariant): this is the
// only module allowed to touch the persistence layer. Data lives in a SQLite
// database (via node:sqlite) at the configured path. On startup, if a legacy
// JSON store (`<name>.json` next to the DB) exists and the DB is empty, its
// notes are imported once; the JSON file itself is never modified.
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string; // ISO-8601
}

/** Legacy JSON store layout (v1): `{ "version": 1, "notes": { "<id>": Note } }`. */
interface LegacyStoreFile {
  version: 1;
  notes: Record<string, Note>;
}

function isLegacyStoreFile(value: unknown): value is LegacyStoreFile {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    typeof (value as { notes?: unknown }).notes === "object" &&
    (value as { notes?: unknown }).notes !== null
  );
}

interface NoteRow {
  id: string;
  title: string;
  body: string;
  tags: string; // JSON-encoded string[]
  createdAt: string;
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.createdAt,
  };
}

export class Storage {
  private constructor(private readonly db: DatabaseSync) {}

  /**
   * Open the SQLite store at `file` (parent directory created as needed).
   * A file that exists but is not a SQLite database is a hard startup error
   * naming the path — user data is never silently overwritten.
   *
   * One-time migration: if a legacy JSON store sits next to the DB (same
   * basename with a `.json` extension, e.g. `data/notes.json` beside
   * `data/notes.db`) and the DB holds no notes, its notes are imported in
   * their original order. The JSON file is left untouched afterwards.
   */
  static open(file: string): Promise<Storage> {
    // Work is synchronous (node:sqlite is sync), but failures must surface as
    // a rejected promise so callers' await/.rejects semantics hold.
    try {
      return Promise.resolve(Storage.openSync(file));
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private static openSync(file: string): Storage {
    mkdirSync(path.dirname(file), { recursive: true });
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(file);
      db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id        TEXT PRIMARY KEY,
          title     TEXT NOT NULL,
          body      TEXT NOT NULL,
          tags      TEXT NOT NULL,
          createdAt TEXT NOT NULL
        )
      `);
    } catch (err) {
      throw new Error(
        `noteapi store at ${file} is not a usable SQLite database (${(err as Error).message}); refusing to overwrite it`,
        { cause: err },
      );
    }
    const storage = new Storage(db);
    try {
      storage.migrateFromLegacyJson(file);
    } catch (err) {
      db.close();
      throw err;
    }
    return storage;
  }

  /** Import notes from the legacy JSON store, if present and the DB is empty. */
  private migrateFromLegacyJson(file: string): void {
    const parsed = path.parse(file);
    const legacy = path.join(parsed.dir, `${parsed.name}.json`);
    if (legacy === file || !existsSync(legacy)) return;
    const { n } = this.db.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number };
    if (n > 0) return;

    let data: unknown;
    try {
      data = JSON.parse(readFileSync(legacy, "utf8"));
    } catch (err) {
      throw new Error(
        `legacy noteapi store at ${legacy} is not valid JSON (${(err as Error).message}); refusing to import it`,
        { cause: err },
      );
    }
    if (!isLegacyStoreFile(data)) {
      throw new Error(
        `legacy noteapi store at ${legacy} has an unrecognized shape; refusing to import it`,
      );
    }
    const insert = this.db.prepare(
      "INSERT INTO notes (id, title, body, tags, createdAt) VALUES (?, ?, ?, ?, ?)",
    );
    this.db.exec("BEGIN");
    try {
      // JSON key order is insertion order; inserting in that order preserves
      // the legacy list tie-break (rowid keeps insertion order).
      for (const note of Object.values(data.notes)) {
        insert.run(
          note.id,
          note.title,
          note.body,
          JSON.stringify(Array.isArray(note.tags) ? note.tags : []),
          note.createdAt,
        );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  createNote(input: { title: string; body: string }): Promise<Note> {
    const note: Note = {
      id: randomUUID(),
      title: input.title,
      body: input.body,
      tags: [],
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO notes (id, title, body, tags, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run(note.id, note.title, note.body, JSON.stringify(note.tags), note.createdAt);
    return Promise.resolve(note);
  }

  getNote(id: string): Note | undefined {
    const row = this.db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as
      | NoteRow
      | undefined;
    return row ? rowToNote(row) : undefined;
  }

  /** Remove a note permanently; returns false when the id is unknown. */
  deleteNote(id: string): Promise<boolean> {
    const { changes } = this.db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    return Promise.resolve(changes > 0);
  }

  /**
   * All notes, newest first (createdAt descending). Tie-break: most recently
   * created first — reverse insertion order, which rowid preserves across
   * restarts (and the JSON migration inserts in legacy key order).
   */
  listNotes(): Note[] {
    const rows = this.db
      .prepare("SELECT * FROM notes ORDER BY createdAt DESC, rowid DESC")
      .all() as unknown as NoteRow[];
    return rows.map(rowToNote);
  }

  /** Close the underlying database handle (used by tests; idempotent-safe boot code needs no call). */
  close(): void {
    this.db.close();
  }
}
