import type { IncomingMessage, ServerResponse } from "node:http";
import { TTYD_USER, TTYD_PASS } from "../config.js";

export function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function jsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Basic ")) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="ACFS"' });
    res.end("Unauthorized");
    return false;
  }
  const [user, pass] = Buffer.from(auth.split(" ")[1], "base64")
    .toString()
    .split(":");
  if (user !== TTYD_USER || pass !== TTYD_PASS) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="ACFS"' });
    res.end("Unauthorized");
    return false;
  }
  return true;
}

export function requireJsonContentType(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const ct = req.headers["content-type"] || "";
  if (!ct.startsWith("application/json")) {
    jsonResponse(res, 415, { error: "Content-Type must be application/json" });
    return false;
  }
  return true;
}

export function checkUpgradeAuth(req: IncomingMessage): boolean {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Basic ")) return false;
  const [user, pass] = Buffer.from(auth.split(" ")[1], "base64")
    .toString()
    .split(":");
  return user === TTYD_USER && pass === TTYD_PASS;
}
