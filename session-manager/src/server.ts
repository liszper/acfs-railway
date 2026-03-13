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

export function createServer(): http.Server {
  const server = http.createServer(routeRequest);
  server.on("upgrade", handleWebSocketUpgrade);
  return server;
}
