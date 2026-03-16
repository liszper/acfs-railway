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
    const headers = { ...proxyRes.headers };
    const existing = headers["set-cookie"] || [];
    const arr = Array.isArray(existing) ? [...existing] : [existing];
    arr.push(authCookieHeader());
    headers["set-cookie"] = arr;
    res.writeHead(proxyRes.statusCode!, headers);
    proxyRes.pipe(res);
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
