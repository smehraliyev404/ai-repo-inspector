import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFeatureBranchFixture, type GitFixture } from "./helpers/git-fixture.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(projectRoot, "node_modules", ".bin", "tsx");
const cliEntry = join(projectRoot, "src", "cli.ts");

function runCli(args: string[], cwd: string) {
  const result = spawnSync(tsx, [cliEntry, ...args], { cwd, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("CLI", () => {
  let fixture: GitFixture;
  beforeEach(() => {
    fixture = createFeatureBranchFixture();
  });
  afterEach(() => fixture.cleanup());

  it("accepts a repository path containing spaces", () => {
    expect(fixture.dir).toContain(" ");
    const { code, stderr } = runCli(["review", "--repo", fixture.dir, "--output", "-"], fixture.dir);

    expect(stderr).toBe("");
    expect(code).toBe(0);
  });

  it("prints JSON for --format json, and exits 1 when a check fails", () => {
    const { code, stdout } = runCli(
      ["review", "--repo", fixture.dir, "--format", "json", "--output", "-", "--validate", "exit 4"],
      fixture.dir,
    );
    const result = JSON.parse(stdout);

    expect(code).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.changedFiles).toContainEqual({ path: "feature.txt", status: "added" });
    expect(result.validations[0]).toMatchObject({ command: "exit 4", status: "failed", exitCode: 4 });
  });

  it("writes review-report.md by default and exits 0 when everything passes", () => {
    const { code } = runCli(["review", "--repo", ".", "--validate", "echo ok"], fixture.dir);

    expect(code).toBe(0);
    expect(readFileSync(join(fixture.dir, "review-report.md"), "utf8")).toContain("echo ok");
  });

  it.each([
    [["review", "--repo", ".", "--format", "xml"], /--format must be/],
    [["review", "--repo", ".", "--bogus"], /Unknown option: --bogus/],
    [["review", "--repo"], /--repo needs a value/],
    [["review"], /Usage/],
  ])("rejects bad arguments %j with exit code 2", (args, message) => {
    const { code, stderr } = runCli(args, fixture.dir);

    expect(code).toBe(2);
    expect(stderr).toMatch(message);
    expect(existsSync(join(fixture.dir, "review-report.md"))).toBe(false);
  });
});
