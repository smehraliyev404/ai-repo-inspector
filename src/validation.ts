import { spawn } from "node:child_process";
import type { ValidationResult } from "./types.js";

export type ValidationLimits = {
  /** Wall-clock limit per command. */
  timeoutMs?: number;
  /** Maximum output kept per command; the rest is dropped from the middle. */
  maxOutputBytes?: number;
};

export const DEFAULT_LIMITS: Required<ValidationLimits> = {
  timeoutMs: 5 * 60 * 1000,
  maxOutputBytes: 32 * 1024,
};

/**
 * Keeps the first quarter and the last three quarters of the byte budget, in
 * bounded memory. Test runners usually print the failure summary at the end.
 */
class BoundedOutput {
  private head: Buffer[] = [];
  private headBytes = 0;
  private tail: Buffer[] = [];
  private tailBytes = 0;
  private totalBytes = 0;
  private readonly headLimit: number;
  private readonly tailLimit: number;

  constructor(maxBytes: number) {
    this.headLimit = Math.floor(maxBytes / 4);
    this.tailLimit = maxBytes - this.headLimit;
  }

  push(chunk: Buffer): void {
    this.totalBytes += chunk.length;
    if (this.headBytes < this.headLimit) {
      const take = chunk.subarray(0, this.headLimit - this.headBytes);
      this.head.push(take);
      this.headBytes += take.length;
      chunk = chunk.subarray(take.length);
    }
    if (chunk.length === 0) return;
    this.tail.push(chunk);
    this.tailBytes += chunk.length;
    // Drop whole chunks we no longer need; always keep the newest one (it is sliced in toString).
    while (this.tail.length > 1 && this.tailBytes - this.tail[0].length >= this.tailLimit) {
      this.tailBytes -= this.tail.shift()!.length;
    }
  }

  toString(): string {
    const tail = Buffer.concat(this.tail);
    const keptTail = tail.subarray(Math.max(0, tail.length - this.tailLimit));
    const omitted = this.totalBytes - this.headBytes - keptTail.length;
    const head = Buffer.concat(this.head).toString("utf8");
    if (omitted <= 0) return head + keptTail.toString("utf8");
    return `${head}\n[... ${omitted} bytes omitted ...]\n${keptTail.toString("utf8")}`;
  }
}

/**
 * Runs one validation command through the shell. A non-zero exit is a normal
 * outcome ("failed"), not an exception: reporting failures is the point of the tool.
 * stdout and stderr are collected into one stream in arrival order.
 */
export function runValidation(
  command: string,
  cwd: string,
  limits: ValidationLimits = {},
): Promise<ValidationResult> {
  const { timeoutMs, maxOutputBytes } = { ...DEFAULT_LIMITS, ...limits };
  return new Promise((resolve) => {
    const output = new BoundedOutput(maxOutputBytes);
    // detached: the shell gets its own process group, so a timeout can kill the
    // shell *and* anything it started (otherwise children keep the pipes open).
    const child = spawn(command, { cwd, shell: true, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => output.push(chunk));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ command, status: "failed", exitCode: null, timedOut, output: `Failed to start: ${error.message}` });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      let text = output.toString();
      if (timedOut) text += `\n[timed out after ${timeoutMs} ms and was killed]`;
      else if (signal) text += `\n[terminated by signal ${signal}]`;
      const status = code === 0 && !timedOut ? "passed" : "failed";
      resolve({ command, status, exitCode: code, timedOut, output: text });
    });
  });
}

/** Runs every command in order; a failure does not stop the remaining ones. */
export async function runValidations(
  commands: string[],
  cwd: string,
  limits: ValidationLimits = {},
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, limits));
  }
  return results;
}
