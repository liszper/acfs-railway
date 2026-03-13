import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PORT } from "../config.js";
import { ttydInstances } from "./ttyd.js";
import { checkUpgradeAuth } from "../utils/http.js";
import { ensureTmuxSession } from "./sessions.js";
import { startTtydForSession } from "./ttyd.js";

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
    headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode!, proxyRes.headers);
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
  _head: Buffer
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
  if (!ttydInstances.has(sessionName)) {
    socket.destroy();
    return;
  }

  const { port } = ttydInstances.get(sessionName)!;
  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port,
    path: req.url,
    method: "GET",
    headers: { ...req.headers, host: `127.0.0.1:${port}` },
  };

  const proxy = http.request(options);
  proxy.on("upgrade", (proxyRes, proxySocket, _proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n"
    );
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxy.on("error", () => socket.destroy());
  proxy.end();
}
