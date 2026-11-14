import { spawn } from "node:child_process";
import type { ValidationResult } from "./types.js";

/**
 * Runs one validation command through the shell. A non-zero exit is a normal
 * outcome ("failed"), not an exception: reporting failures is the point of the tool.
 * stdout and stderr are collected into one stream in arrival order.
 */
export function runValidation(command: string, cwd: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("error", (error) => {
      resolve({ command, status: "failed", exitCode: null, output: `Failed to start: ${error.message}` });
    });
    child.on("close", (code, signal) => {
      let output = Buffer.concat(chunks).toString("utf8");
      if (signal) output += `\n[terminated by signal ${signal}]`;
      resolve({ command, status: code === 0 ? "passed" : "failed", exitCode: code, output });
    });
  });
}

/** Runs every command in order; a failure does not stop the remaining ones. */
export async function runValidations(commands: string[], cwd: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd));
  }
  return results;
}
