import { execSync, exec } from "node:child_process";
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

export function execAsUserAsync(
  command: string,
  timeout = 8000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    exec(
      `su - ${ACFS_USER} -c ${shellEscape(command)}`,
      { encoding: "utf8", timeout },
      (error, stdout, stderr) => {
        const exitCode = error
          ? typeof (error as { code?: unknown }).code === "number"
            ? ((error as { code: number }).code)
            : 1
          : 0;
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode,
        });
      }
    );
  });
}
