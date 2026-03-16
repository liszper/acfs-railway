import type { IncomingMessage, ServerResponse } from "node:http";
import { TTYD_USER, TTYD_PASS } from "../config.js";

const AUTH_COOKIE = "acfs_ws";

function authTokenValue(): string {
  return Buffer.from(`${TTYD_USER}:${TTYD_PASS}`).toString("base64");
}

export function authCookieHeader(): string {
  return `${AUTH_COOKIE}=${authTokenValue()}; Path=/; HttpOnly; SameSite=Lax`;
}

export function readBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk;
    });
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

export function checkBunAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.split(" ")[1], "base64").toString();
    const [user, pass] = decoded.split(":");
    if (user === TTYD_USER && pass === TTYD_PASS) return true;
  }

  const cookies = req.headers.get("cookie") || "";
  const match = cookies.match(/(?:^|;\s*)acfs_ws=([^;]+)/);
  if (match && match[1] === authTokenValue()) return true;

  return false;
}
