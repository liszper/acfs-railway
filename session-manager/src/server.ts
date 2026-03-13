import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PORT } from "./config.js";
import { checkAuth } from "./utils/http.js";
import { getTmuxSessions } from "./services/sessions.js";
import { ttydInstances, startTtydForSession } from "./services/ttyd.js";
import { handleSessionProxy, handleWebSocketUpgrade } from "./services/proxy.js";
import { dashboardHTML } from "./dashboard/template.js";
import {
  handleListSessions,
  handleCreateSession,
  handleDeleteSession,
  handleNtmSpawn,
  handleNtmSend,
  handleNtmInterrupt,
  handleNtmStatus,
  handleToolStatus,
  handleSystemStats,
  handleEnvStatus,
  handleCassSearch,
  handleCautUsage,
} from "./routes/api.js";

function routeRequest(
  req: IncomingMessage,
  res: ServerResponse
): void {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (!checkAuth(req, res)) return;

  if (url.pathname === "/" || url.pathname === "") {
    const sessions = getTmuxSessions();
    for (const s of sessions) {
      if (!ttydInstances.has(s.name)) {
        startTtydForSession(s.name);
      }
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(dashboardHTML(sessions));
    return;
  }

  if (url.pathname === "/api/sessions" && req.method === "GET") {
    handleListSessions(req, res);
    return;
  }

  if (url.pathname === "/api/sessions" && req.method === "POST") {
    handleCreateSession(req, res);
    return;
  }

  const deleteMatch = url.pathname.match(
    /^\/api\/sessions\/([a-zA-Z0-9_-]+)$/
  );
  if (deleteMatch && req.method === "DELETE") {
    handleDeleteSession(req, res, deleteMatch[1]);
    return;
  }

  if (url.pathname === "/api/ntm/spawn" && req.method === "POST") {
    handleNtmSpawn(req, res);
    return;
  }

  if (url.pathname === "/api/ntm/send" && req.method === "POST") {
    handleNtmSend(req, res);
    return;
  }

  if (url.pathname === "/api/ntm/interrupt" && req.method === "POST") {
    handleNtmInterrupt(req, res);
    return;
  }

  const ntmStatusMatch = url.pathname.match(
    /^\/api\/ntm\/status\/([a-zA-Z0-9_-]+)$/
  );
  if (ntmStatusMatch && req.method === "GET") {
    handleNtmStatus(req, res, ntmStatusMatch[1]);
    return;
  }

  if (url.pathname === "/api/tools/status" && req.method === "GET") {
    handleToolStatus(req, res);
    return;
  }

  if (url.pathname === "/api/tools/system" && req.method === "GET") {
    handleSystemStats(req, res);
    return;
  }

  if (url.pathname === "/api/tools/env" && req.method === "GET") {
    handleEnvStatus(req, res);
    return;
  }

  if (url.pathname === "/api/tools/cass" && req.method === "POST") {
    handleCassSearch(req, res);
    return;
  }

  if (url.pathname === "/api/tools/caut" && req.method === "GET") {
    handleCautUsage(req, res);
    return;
  }

  const sessionMatch = url.pathname.match(
    /^\/s\/([a-zA-Z0-9_-]+)(\/.*)?$/
  );
  if (sessionMatch) {
    handleSessionProxy(req, res, sessionMatch[1]);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

export function createServer(): http.Server {
  const server = http.createServer(routeRequest);
  server.on("upgrade", handleWebSocketUpgrade);
  return server;
}
