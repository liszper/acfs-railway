import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server, ServerWebSocket } from "bun";
import { PORT } from "./config.js";
import { checkAuth, authCookieHeader, checkBunAuth } from "./utils/http.js";
import { getTmuxSessions, ensureTmuxSession } from "./services/sessions.js";
import { ttydInstances, startTtydForSession } from "./services/ttyd.js";
import { handleSessionProxy } from "./services/proxy.js";
import { dashboardHTML } from "./dashboard/template.js";
import { isNtmAvailable } from "./services/ntm.js";
import type { WsData } from "./types.js";
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
  handleSecretsStatus,
  handleSshGenerate,
  handleSshGithub,
  handleGitConfig,
  handleListProjects,
  handleCloneProject,
  handleProjectDetail,
  handleProjectTree,
  handleProjectStage,
  handleProjectUnstage,
  handleProjectStageAll,
  handleProjectCommit,
  handleProjectPush,
  handleProjectPull,
  handleProjectLog,
  handleProjectBranches,
  handleProjectDiff,
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
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Set-Cookie": authCookieHeader(),
    });
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

  if (url.pathname === "/api/secrets/status" && req.method === "GET") {
    handleSecretsStatus(req, res);
    return;
  }

  if (url.pathname === "/api/secrets/ssh/generate" && req.method === "POST") {
    handleSshGenerate(req, res);
    return;
  }

  if (url.pathname === "/api/secrets/ssh/github" && req.method === "POST") {
    handleSshGithub(req, res);
    return;
  }

  if (url.pathname === "/api/secrets/git" && req.method === "POST") {
    handleGitConfig(req, res);
    return;
  }

  if (url.pathname === "/api/projects" && req.method === "GET") {
    handleListProjects(req, res);
    return;
  }

  if (url.pathname === "/api/projects/clone" && req.method === "POST") {
    handleCloneProject(req, res);
    return;
  }

  const projectNameMatch = url.pathname.match(
    /^\/api\/projects\/([a-zA-Z0-9._-]+)\/(.+)$/
  );
  if (projectNameMatch) {
    const pName = projectNameMatch[1];
    const action = projectNameMatch[2];

    if (action === "detail" && req.method === "GET") {
      handleProjectDetail(req, res, pName);
      return;
    }
    if (action === "tree" && req.method === "GET") {
      handleProjectTree(req, res, pName);
      return;
    }
    if (action === "stage" && req.method === "POST") {
      handleProjectStage(req, res, pName);
      return;
    }
    if (action === "unstage" && req.method === "POST") {
      handleProjectUnstage(req, res, pName);
      return;
    }
    if (action === "stage-all" && req.method === "POST") {
      handleProjectStageAll(req, res, pName);
      return;
    }
    if (action === "commit" && req.method === "POST") {
      handleProjectCommit(req, res, pName);
      return;
    }
    if (action === "push" && req.method === "POST") {
      handleProjectPush(req, res, pName);
      return;
    }
    if (action === "pull" && req.method === "POST") {
      handleProjectPull(req, res, pName);
      return;
    }
    if (action === "log" && req.method === "GET") {
      handleProjectLog(req, res, pName);
      return;
    }
    if (action === "branches" && req.method === "GET") {
      handleProjectBranches(req, res, pName);
      return;
    }
    if (action === "diff" && req.method === "GET") {
      handleProjectDiff(req, res, pName);
      return;
    }
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

export function startServer(): void {
  const nodeServer = http.createServer(routeRequest);

  nodeServer.listen(0, "127.0.0.1", () => {
    const addr = nodeServer.address();
    const nodePort = typeof addr === "object" && addr ? addr.port : 0;

    Bun.serve<WsData>({
      port: PORT,

      async fetch(req: Request, server: Server): Promise<Response | undefined> {
        const url = new URL(req.url);

        // --- WebSocket upgrade: relay to ttyd ---
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const sessionMatch = url.pathname.match(
            /^\/s\/([a-zA-Z0-9_-]+)(\/.*)?$/
          );
          if (!sessionMatch) {
            return new Response("Not found", { status: 404 });
          }

          if (!checkBunAuth(req)) {
            return new Response("Unauthorized", { status: 401 });
          }

          const sessionName = sessionMatch[1];
          ensureTmuxSession(sessionName);
          const port = startTtydForSession(sessionName);

          const ok = server.upgrade(req, {
            data: {
              sessionName,
              port,
              upstream: null,
              pending: [],
            } satisfies WsData,
            headers: { "Sec-WebSocket-Protocol": "tty" },
          });

          return ok ? undefined : new Response("Upgrade failed", { status: 500 });
        }

        // --- Everything else (dashboard, API, session pages): proxy to Node ---
        const targetUrl = `http://127.0.0.1:${nodePort}${url.pathname}${url.search}`;
        try {
          const nodeResp = await fetch(targetUrl, {
            method: req.method,
            headers: req.headers,
            body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
          });
          const body = new Uint8Array(await nodeResp.arrayBuffer());
          const headers = new Headers(nodeResp.headers);
          headers.delete("transfer-encoding");
          headers.set("content-length", String(body.byteLength));
          console.log(`[proxy] ${url.pathname} → ${nodeResp.status} ${body.byteLength} bytes`);
          return new Response(body, {
            status: nodeResp.status,
            headers,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Internal proxy error";
          return new Response(msg, { status: 502 });
        }
      },

      websocket: {
        open(ws: ServerWebSocket<WsData>) {
          const { sessionName, port } = ws.data;
          console.log(`[ws-relay] ${sessionName} opening upstream to 127.0.0.1:${port}`);

          const upstream = new WebSocket(
            `ws://127.0.0.1:${port}/s/${sessionName}/ws`,
            ["tty"]
          );
          upstream.binaryType = "arraybuffer";

          upstream.onopen = () => {
            console.log(`[ws-relay] ${sessionName} upstream connected`);
            ws.data.upstream = upstream;
            for (const msg of ws.data.pending) {
              upstream.send(msg);
            }
            ws.data.pending = [];
          };

          upstream.onmessage = (e: MessageEvent) => {
            const data = e.data;
            if (data instanceof ArrayBuffer) {
              ws.sendBinary(new Uint8Array(data));
            } else if (typeof data === "string") {
              ws.send(data);
            }
          };

          upstream.onclose = () => {
            console.log(`[ws-relay] ${sessionName} upstream closed`);
            ws.close();
          };

          upstream.onerror = () => {
            console.error(`[ws-relay] ${sessionName} upstream error`);
            ws.close();
          };
        },

        message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
          const up = ws.data.upstream;
          if (up && up.readyState === WebSocket.OPEN) {
            up.send(message);
          } else {
            ws.data.pending.push(message);
          }
        },

        close(ws: ServerWebSocket<WsData>) {
          ws.data.upstream?.close();
        },
      },
    });

    console.log(`ACFS Session Manager running on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/`);
    console.log(`Main terminal: http://localhost:${PORT}/s/main/`);
    console.log(`NTM available: ${isNtmAvailable()}`);
  });
}
