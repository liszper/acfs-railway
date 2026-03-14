import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PORT, TTYD_USER, TTYD_PASS } from "../config.js";
import { ttydInstances } from "./ttyd.js";
import { checkUpgradeAuth } from "../utils/http.js";
import { ensureTmuxSession } from "./sessions.js";
import { startTtydForSession } from "./ttyd.js";

/** Build Basic auth header for ttyd's own `-c` credential gate. */
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

  // Ensure ttyd is running — it may not be if the user navigated directly
  // to /s/<name>/ws without first loading the HTML page.
  ensureTmuxSession(sessionName);
  const port = startTtydForSession(sessionName);

  const instance = ttydInstances.get(sessionName);
  if (!instance) {
    socket.destroy();
    return;
  }

  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port,
    path: req.url,
    method: "GET",
    headers: {
      ...req.headers,
      host: `127.0.0.1:${port}`,
      authorization: ttydAuthHeader(),
    },
  };

  const proxy = http.request(options);

  proxy.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    // Send 101 back to the client with upstream headers
    const headerLines = Object.entries(proxyRes.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${headerLines}\r\n\r\n`
    );

    // Forward any buffered data from both sides
    if (proxyHead && proxyHead.length > 0) {
      socket.write(proxyHead);
    }
    if (head && head.length > 0) {
      proxySocket.write(head);
    }

    // Bi-directional pipe
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    // Clean up on either side closing
    proxySocket.on("error", () => socket.destroy());
    socket.on("error", () => proxySocket.destroy());
    proxySocket.on("close", () => socket.destroy());
    socket.on("close", () => proxySocket.destroy());
  });

  proxy.on("error", (err) => {
    console.error(`[ws-proxy] error connecting to ttyd (${sessionName}:${port}):`, err.message);
    socket.destroy();
  });

  // Handle case where ttyd responds with a non-upgrade (e.g. 401, 502)
  proxy.on("response", (proxyRes) => {
    console.error(
      `[ws-proxy] ttyd (${sessionName}:${port}) responded ${proxyRes.statusCode} instead of 101`
    );
    const status = proxyRes.statusCode || 502;
    socket.write(`HTTP/1.1 ${status} ${proxyRes.statusMessage || "Error"}\r\n\r\n`);
    socket.destroy();
  });

  proxy.end();
}
