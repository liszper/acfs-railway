import { execSync } from "node:child_process";
import { ACFS_USER } from "../config.js";

export function shellEscape(str: string): string {
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

export function execAsUser(
  command: string,
  timeout = 5000
): string {
  return execSync(`su - ${ACFS_USER} -c ${shellEscape(command)}`, {
    encoding: "utf8",
    timeout,
  });
}

export function execAsUserSafe(
  command: string,
  timeout = 5000
): string | null {
  try {
    return execAsUser(command, timeout);
  } catch {
    return null;
  }
}
