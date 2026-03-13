import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, jsonResponse } from "../utils/http.js";
import { getTmuxSessions, ensureTmuxSession, killSession } from "../services/sessions.js";
import { startTtydForSession } from "../services/ttyd.js";
import { ntmSpawn, ntmSend, ntmInterrupt, ntmStatus } from "../services/ntm.js";
import {
  getToolStatus,
  getSystemStats,
  getEnvStatus,
  cassSearch,
  cautUsage,
} from "../services/tools.js";
import type { NtmSpawnOpts } from "../types.js";

export function handleListSessions(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  jsonResponse(res, 200, getTmuxSessions());
}

export function handleCreateSession(
  req: IncomingMessage,
  res: ServerResponse
): void {
  let body = "";
  req.on("data", (chunk: Buffer) => (body += chunk));
  req.on("end", () => {
    try {
      const { name } = JSON.parse(body);
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        jsonResponse(res, 400, { error: "Invalid session name" });
        return;
      }
      ensureTmuxSession(name);
      const port = startTtydForSession(name);
      setTimeout(() => {
        jsonResponse(res, 201, { name, url: `/s/${name}/`, port });
      }, 500);
    } catch {
      jsonResponse(res, 400, { error: "Invalid request" });
    }
  });
}

export function handleDeleteSession(
  _req: IncomingMessage,
  res: ServerResponse,
  sessionName: string
): void {
  killSession(sessionName);
  jsonResponse(res, 200, { ok: true });
}

export function handleNtmSpawn(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const { name, recipe, template, cc, cod, gmi, prompt } = body as Record<
        string,
        unknown
      >;
      if (
        !name ||
        typeof name !== "string" ||
        !/^[a-zA-Z0-9_-]+$/.test(name)
      ) {
        jsonResponse(res, 400, { error: "Invalid session name" });
        return;
      }
      const opts: NtmSpawnOpts = {
        recipe: recipe as string | undefined,
        template: template as string | undefined,
        cc: cc as number | undefined,
        cod: cod as number | undefined,
        gmi: gmi as number | undefined,
        prompt: prompt as string | undefined,
      };
      const result = ntmSpawn(name, opts);
      if (result.error) {
        jsonResponse(res, 500, result);
        return;
      }
      ensureTmuxSession(name);
      startTtydForSession(name);
      setTimeout(() => {
        jsonResponse(res, 201, result);
      }, 500);
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handleNtmSend(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const { session, prompt, target } = body as Record<string, unknown>;
      if (!session || !prompt) {
        jsonResponse(res, 400, {
          error: "session and prompt are required",
        });
        return;
      }
      const result = ntmSend(
        session as string,
        prompt as string,
        target as string | undefined
      );
      jsonResponse(res, result.error ? 500 : 200, result);
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handleNtmInterrupt(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const { session } = body as Record<string, unknown>;
      if (!session) {
        jsonResponse(res, 400, { error: "session is required" });
        return;
      }
      const result = ntmInterrupt(session as string);
      jsonResponse(res, result.error ? 500 : 200, result);
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handleNtmStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  sessionName: string
): void {
  const result = ntmStatus(sessionName);
  jsonResponse(res, "error" in result ? 500 : 200, result);
}

export function handleToolStatus(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  jsonResponse(res, 200, getToolStatus());
}

export function handleSystemStats(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  jsonResponse(res, 200, getSystemStats());
}

export function handleEnvStatus(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  jsonResponse(res, 200, getEnvStatus());
}

export function handleCassSearch(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const { query } = body as Record<string, unknown>;
      if (!query) {
        jsonResponse(res, 400, { error: "query is required" });
        return;
      }
      try {
        const result = cassSearch(query as string);
        jsonResponse(res, 200, result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "cass search failed";
        jsonResponse(res, 500, { error: msg });
      }
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handleCautUsage(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    const result = cautUsage();
    jsonResponse(res, 200, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "caut usage failed";
    jsonResponse(res, 500, { error: msg });
  }
}
