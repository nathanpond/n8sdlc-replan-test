// noteapi entrypoint: wire NOTEAPI_FILE-backed storage to the HTTP server.
// NOTEAPI_FILE points at the SQLite database; a legacy data/notes.json next to
// it is imported on first boot (see src/storage.ts).
import { Storage } from "./storage.js";
import { makeServer } from "./server.js";

const file = process.env.NOTEAPI_FILE ?? "./data/notes.db";
const port = Number(process.env.PORT ?? 3000);

const storage = await Storage.open(file);
makeServer(storage).listen(port, () => {
  console.log(`noteapi listening on port ${String(port)} (store: ${file})`);
});
