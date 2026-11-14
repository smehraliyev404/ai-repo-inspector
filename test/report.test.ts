import { describe, expect, it } from "vitest";
import { markdownReport } from "../src/report.js";

describe("markdownReport", () => {
  it("lists changed files and validation output", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      baseRef: "main",
      passed: true,
      changedFiles: [{ path: "src/index.ts", status: "modified" }],
      validations: [{ command: "npm test", status: "passed", exitCode: 0, timedOut: false, output: "ok" }],
    });

    expect(report).toContain("`src/index.ts` (modified)");
    expect(report).toContain("npm test");
    expect(report).toContain("ok");
  });
});
