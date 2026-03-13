import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ACFS_USER } from "../config.js";
import { shellEscape, execAsUser } from "../utils/shell.js";
import type { ToolStatusMap, SystemStats, EnvStatus } from "../types.js";

const TOOL_LIST = [
  "claude", "codex", "gemini", "opencode", "ntm", "cass", "br", "bv", "dcg", "slb",
  "ubs", "cm", "sg", "rg", "bat", "fd", "eza", "delta", "fzf", "zoxide",
  "lazygit", "atuin", "pt", "rano", "caut", "ms", "apr", "ru", "jfp", "s2p",
  "brenner", "giil", "csctf", "mdwb", "aadc", "toon", "am", "gh", "railway",
  "wrangler", "supabase", "vercel", "vault", "code-server", "gopls", "pyright", "rust-analyzer",
];

let toolStatusCache: ToolStatusMap | null = null;
let toolStatusTime = 0;
let lastCpuReading: { idle: number; total: number } | null = null;

export function getToolStatus(): ToolStatusMap {
  const now = Date.now();
  if (toolStatusCache !== null && now - toolStatusTime < 60000) {
    return toolStatusCache;
  }
  const result: ToolStatusMap = {};
  try {
    const checks = TOOL_LIST.map(
      (t) => `command -v ${t} >/dev/null 2>&1 && echo "${t}:1" || echo "${t}:0"`
    ).join("; ");
    const output = execSync(
      `su - ${ACFS_USER} -c ${shellEscape(checks)}`,
      { encoding: "utf8", timeout: 15000 }
    );
    output
      .trim()
      .split("\n")
      .forEach((line) => {
        const parts = line.trim().split(":");
        if (parts[0]) result[parts[0]] = parts[1] === "1";
      });
  } catch {
    TOOL_LIST.forEach((t) => {
      result[t] = false;
    });
  }
  toolStatusCache = result;
  toolStatusTime = now;
  return result;
}

export function getSystemStats(): SystemStats {
  const stats: SystemStats = {
    cpu: null,
    memUsed: null,
    memTotal: null,
    diskUsed: null,
    diskTotal: null,
  };
  try {
    const meminfo = readFileSync("/proc/meminfo", "utf8");
    const memTotalKB = parseInt(
      (meminfo.match(/MemTotal:\s+(\d+)/) || [])[1] || "0"
    );
    const memAvailKB = parseInt(
      (meminfo.match(/MemAvailable:\s+(\d+)/) || [])[1] || "0"
    );
    stats.memTotal = memTotalKB * 1024;
    stats.memUsed = (memTotalKB - memAvailKB) * 1024;
  } catch {}
  try {
    const stat = readFileSync("/proc/stat", "utf8");
    const parts = stat
      .split("\n")[0]
      .trim()
      .split(/\s+/)
      .slice(1)
      .map(Number);
    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((a, b) => a + b, 0);
    if (lastCpuReading) {
      const idleDelta = idle - lastCpuReading.idle;
      const totalDelta = total - lastCpuReading.total;
      if (totalDelta > 0)
        stats.cpu = (1 - idleDelta / totalDelta) * 100;
    }
    lastCpuReading = { idle, total };
  } catch {}
  try {
    const df = execSync("df -B1 /data 2>/dev/null || df -B1 / 2>/dev/null", {
      encoding: "utf8",
      timeout: 3000,
    });
    const lines = df.trim().split("\n");
    if (lines.length >= 2) {
      const cols = lines[1].trim().split(/\s+/);
      stats.diskTotal = parseInt(cols[1]) || null;
      stats.diskUsed = parseInt(cols[2]) || null;
    }
  } catch {}
  return stats;
}

export function getEnvStatus(): EnvStatus {
  return {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    GH_TOKEN: !!process.env.GH_TOKEN,
  };
}

export function cassSearch(query: string): unknown {
  const output = execAsUser(
    "cass search --json " + shellEscape(query),
    15000
  );
  try {
    return JSON.parse(output.trim());
  } catch {
    return { raw: output.trim() };
  }
}

export function cautUsage(): unknown {
  const output = execAsUser("caut usage --json", 10000);
  try {
    return JSON.parse(output.trim());
  } catch {
    return { raw: output.trim() };
  }
}
