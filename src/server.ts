// node:http server + router. All persistence goes through src/storage.ts —
// route handlers only call storage methods (storage-boundary invariant).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Storage } from "./storage.js";

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Parse and validate a create payload; returns an error string when invalid. */
function parseCreate(raw: string): { title: string; body: string } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "request body is not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { error: "request body must be a JSON object" };
  }
  const { title, body } = parsed as { title?: unknown; body?: unknown };
  if (typeof title !== "string" || title.trim() === "") {
    return { error: "title is required and must be a non-empty string" };
  }
  if (body !== undefined && typeof body !== "string") {
    return { error: "body must be a string when present" };
  }
  return { title, body: body ?? "" };
}

async function handle(storage: Storage, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter((s) => s !== "");

  if (segments[0] === "notes") {
    if (segments.length === 1 && req.method === "POST") {
      const input = parseCreate(await readBody(req));
      if ("error" in input) return sendJson(res, 400, { error: input.error });
      return sendJson(res, 201, await storage.createNote(input));
    }
    if (segments.length === 2 && req.method === "GET") {
      const note = storage.getNote(decodeURIComponent(segments[1] ?? ""));
      if (!note) return sendJson(res, 404, { error: "not found" });
      return sendJson(res, 200, note);
    }
  }
  sendJson(res, 404, { error: "not found" });
}

export function makeServer(storage: Storage): Server {
  return createServer((req, res) => {
    handle(storage, req, res).catch((err: unknown) => {
      // A handler bug must not crash the process or hang the request.
      console.error("noteapi: unhandled error", err);
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      else res.end();
    });
  });
}
