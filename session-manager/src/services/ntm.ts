import { execSync } from "node:child_process";
import { ACFS_USER } from "../config.js";
import { shellEscape } from "../utils/shell.js";
import type { NtmSpawnOpts, NtmResult } from "../types.js";

let ntmAvailableCache: boolean | null = null;
let ntmAvailableCacheTime = 0;

export function isNtmAvailable(): boolean {
  const now = Date.now();
  if (ntmAvailableCache !== null && now - ntmAvailableCacheTime < 30000) {
    return ntmAvailableCache;
  }
  try {
    execSync(`su - ${ACFS_USER} -c "which ntm" 2>/dev/null`, {
      encoding: "utf8",
      timeout: 3000,
    });
    ntmAvailableCache = true;
  } catch {
    ntmAvailableCache = false;
  }
  ntmAvailableCacheTime = now;
  return ntmAvailableCache;
}

export function ntmSpawn(name: string, opts: NtmSpawnOpts): NtmResult {
  if (!isNtmAvailable()) return { error: "ntm not available" };
  let args = `ntm spawn ${shellEscape(name)}`;
  if (opts.recipe) {
    args += ` --recipe=${shellEscape(opts.recipe)}`;
  } else if (opts.template) {
    args += ` --template=${shellEscape(opts.template)}`;
  } else {
    if (opts.cc) args += ` --cc=${parseInt(String(opts.cc))}`;
    if (opts.cod) args += ` --cod=${parseInt(String(opts.cod))}`;
    if (opts.gmi) args += ` --gmi=${parseInt(String(opts.gmi))}`;
  }
  if (opts.prompt) {
    args += ` --prompt=${shellEscape(opts.prompt)}`;
  }
  try {
    execSync(`su - ${ACFS_USER} -c ${shellEscape(args)}`, {
      encoding: "utf8",
      timeout: 15000,
    });
    return { ok: true, name, url: `/s/${name}/` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ntm spawn failed";
    return { error: msg };
  }
}

export function ntmSend(
  session: string,
  prompt: string,
  target?: string
): NtmResult {
  if (!isNtmAvailable()) return { error: "ntm not available" };
  let args = `ntm send ${shellEscape(session)}`;
  if (target && target !== "all") {
    args += ` --${target}`;
  }
  args += ` ${shellEscape(prompt)}`;
  try {
    execSync(`su - ${ACFS_USER} -c ${shellEscape(args)}`, {
      encoding: "utf8",
      timeout: 5000,
    });
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ntm send failed";
    return { error: msg };
  }
}

export function ntmInterrupt(session: string): NtmResult {
  if (!isNtmAvailable()) return { error: "ntm not available" };
  try {
    execSync(
      `su - ${ACFS_USER} -c ${shellEscape("ntm interrupt " + shellEscape(session))}`,
      { encoding: "utf8", timeout: 5000 }
    );
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ntm interrupt failed";
    return { error: msg };
  }
}

export function ntmStatus(session: string): NtmResult | Record<string, unknown> {
  if (!isNtmAvailable()) return { error: "ntm not available" };
  try {
    const output = execSync(
      `su - ${ACFS_USER} -c ${shellEscape("ntm status " + shellEscape(session) + " --json")}`,
      { encoding: "utf8", timeout: 3000 }
    );
    return JSON.parse(output.trim());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ntm status failed";
    return { error: msg };
  }
}
