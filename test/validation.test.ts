import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runReview } from "../src/core.js";
import { markdownReport } from "../src/report.js";
import { runValidation, runValidations } from "../src/validation.js";
import { createFeatureBranchFixture, type GitFixture } from "./helpers/git-fixture.js";

describe("validation results", () => {
  let fixture: GitFixture;
  beforeEach(() => {
    fixture = createFeatureBranchFixture();
  });
  afterEach(() => fixture.cleanup());

  it("records a failing command as failed instead of throwing", async () => {
    const result = await runValidation("echo some-output; echo boom >&2; exit 3", fixture.dir);

    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("some-output");
    expect(result.output).toContain("boom");
  });

  it("keeps both stdout and stderr for a passing command", async () => {
    const result = await runValidation("echo out; echo warn >&2", fixture.dir);

    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("out");
    expect(result.output).toContain("warn");
  });

  it("still runs the remaining commands after one fails", async () => {
    const results = await runValidations(["exit 1", "echo second-ran"], fixture.dir);

    expect(results.map((result) => result.status)).toEqual(["failed", "passed"]);
    expect(results[1].output).toContain("second-ran");
  });

  it("produces a report that shows which check failed", async () => {
    const result = await runReview({
      repositoryPath: fixture.dir,
      validationCommands: ["exit 1", "echo fine"],
    });
    const report = markdownReport(result);

    expect(result.passed).toBe(false);
    expect(report).toContain("`feature.txt` (added)");
    expect(report).toMatch(/exit 1.*failed/);
    expect(report).toMatch(/echo fine.*passed/);
  });
});
