// noteapi entrypoint: wire NOTEAPI_FILE-backed storage to the HTTP server.
import { Storage } from "./storage.js";
import { makeServer } from "./server.js";

const file = process.env.NOTEAPI_FILE ?? "./data/notes.json";
const port = Number(process.env.PORT ?? 3000);

const storage = await Storage.open(file);
makeServer(storage).listen(port, () => {
  console.log(`noteapi listening on port ${String(port)} (store: ${file})`);
});
