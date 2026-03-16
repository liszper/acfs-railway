import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authCookieHeader } from "../utils/http.js";
import { ensureTmuxSession } from "./sessions.js";
import { startTtydForSession } from "./ttyd.js";

function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetPort: number
): void {
  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${targetPort}`,
    },
  };

  const proxy = http.request(options, (proxyRes) => {
    // Buffer the response instead of piping — Bun's fetch() doesn't
    // handle streamed/piped responses from Node http.createServer properly,
    // resulting in 0-byte bodies.
    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const body = Buffer.concat(chunks);
      const headers = { ...proxyRes.headers };
      const existing = headers["set-cookie"] || [];
      const arr = Array.isArray(existing) ? [...existing] : [existing];
      arr.push(authCookieHeader());
      headers["set-cookie"] = arr;
      headers["content-length"] = String(body.length);
      res.writeHead(proxyRes.statusCode!, headers);
      res.end(body);
    });
  });

  proxy.on("error", (err) => {
    res.writeHead(502);
    res.end(`Proxy error: ${err.message}`);
  });

  req.pipe(proxy);
}

export function handleSessionProxy(
  req: IncomingMessage,
  res: ServerResponse,
  sessionName: string
): void {
  ensureTmuxSession(sessionName);
  const port = startTtydForSession(sessionName);
  proxyRequest(req, res, port);
}
