import { spawn } from "node:child_process";
import {
  BASE_TTYD_PORT,
  ACFS_USER,
  ACFS_HOSTNAME,
} from "../config.js";
import type { TtydInstance } from "../types.js";

export const ttydInstances = new Map<string, TtydInstance>();
let nextPort = BASE_TTYD_PORT;

export function startTtydForSession(sessionName: string): number {
  if (ttydInstances.has(sessionName))
    return ttydInstances.get(sessionName)!.port;

  const port = nextPort++;
  const proc = spawn(
    "ttyd",
    [
      "-W",
      "-p",
      String(port),
      "-t",
      `titleFixed=${sessionName} — ${ACFS_HOSTNAME}`,
      "-b",
      `/s/${sessionName}`,
      "su",
      "-",
      ACFS_USER,
      "-c",
      `tmux attach-session -t '${sessionName}' || tmux new-session -s '${sessionName}' -c /data/projects`,
    ],
    { stdio: "ignore", detached: true }
  );

  proc.unref();
  ttydInstances.set(sessionName, { port, process: proc, pid: proc.pid! });

  proc.on("exit", () => {
    ttydInstances.delete(sessionName);
  });

  return port;
}
