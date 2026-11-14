import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runValidation } from "../src/validation.js";

const cwd = tmpdir();

describe("validation limits", () => {
  it("kills a command that exceeds the timeout and reports it as failed", async () => {
    const started = Date.now();
    const result = await runValidation("echo started; sleep 10; echo never", cwd, { timeoutMs: 300 });

    expect(Date.now() - started).toBeLessThan(3000);
    expect(result.status).toBe("failed");
    expect(result.timedOut).toBe(true);
    expect(result.output).toContain("started");
    expect(result.output).not.toContain("never");
    expect(result.output).toContain("timed out");
  });

  it("also stops background children of the command on timeout", async () => {
    const started = Date.now();
    // The grandchild keeps stdout open; killing only the shell would hang until it exits.
    const result = await runValidation("sleep 10 & wait", cwd, { timeoutMs: 300 });

    expect(Date.now() - started).toBeLessThan(3000);
    expect(result.timedOut).toBe(true);
  });

  it("does not crash on large output and caps what it keeps", async () => {
    const result = await runValidation("head -c 2000000 /dev/zero | tr '\\0' x", cwd, { maxOutputBytes: 1000 });

    expect(result.status).toBe("passed");
    expect(result.output.length).toBeLessThan(1200);
    expect(result.output).toContain("bytes omitted");
  });

  it("keeps the start and the end of long output, where errors usually are", async () => {
    const result = await runValidation("seq 1 100000", cwd, { maxOutputBytes: 1000 });

    expect(result.output.startsWith("1\n2\n3\n")).toBe(true);
    expect(result.output.trimEnd().endsWith("99999\n100000")).toBe(true);
  });

  it("handles a zero output budget without crashing", async () => {
    const result = await runValidation("echo hello", cwd, { maxOutputBytes: 0 });

    expect(result.status).toBe("passed");
    expect(result.output).toContain("6 bytes omitted");
  });

  it("does not mark short output as truncated", async () => {
    const result = await runValidation("echo short", cwd, { maxOutputBytes: 1000 });

    expect(result.output).toBe("short\n");
    expect(result.timedOut).toBe(false);
  });
});
