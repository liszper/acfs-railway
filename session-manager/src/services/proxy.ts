import http from "node:http";
import { connect } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PORT, TTYD_USER, TTYD_PASS } from "../config.js";
import { ttydInstances } from "./ttyd.js";
import { checkUpgradeAuth, authCookieHeader } from "../utils/http.js";
import { ensureTmuxSession } from "./sessions.js";
import { startTtydForSession } from "./ttyd.js";

function ttydAuthHeader(): string {
  return (
    "Basic " + Buffer.from(`${TTYD_USER}:${TTYD_PASS}`).toString("base64")
  );
}

export function proxyRequest(
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
      authorization: ttydAuthHeader(),
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

export function handleWebSocketUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer
): void {
  if (!checkUpgradeAuth(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const sessionMatch = url.pathname.match(
    /^\/s\/([a-zA-Z0-9_-]+)(\/.*)?$/
  );

  if (!sessionMatch) {
    socket.destroy();
    return;
  }

  const sessionName = sessionMatch[1];
  ensureTmuxSession(sessionName);
  const port = startTtydForSession(sessionName);

  if (!ttydInstances.has(sessionName)) {
    socket.destroy();
    return;
  }

  const upstream = connect({ port, host: "127.0.0.1" });

  upstream.on("connect", () => {
    const hdrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      hdrs[k] = Array.isArray(v) ? v.join(", ") : v;
    }
    hdrs["host"] = `127.0.0.1:${port}`;
    hdrs["authorization"] = ttydAuthHeader();

    let raw = `GET ${req.url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(hdrs)) {
      raw += `${k}: ${v}\r\n`;
    }
    raw += "\r\n";

    upstream.write(raw);
    if (head.length > 0) upstream.write(head);

    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", (err) => {
    console.error(`[ws-proxy] error (${sessionName}:${port}):`, err.message);
    socket.destroy();
  });
  socket.on("error", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
  socket.on("close", () => upstream.destroy());
}
