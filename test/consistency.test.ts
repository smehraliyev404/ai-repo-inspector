import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runReview } from "../src/core.js";
import { createServer } from "../src/mcp-server.js";
import { markdownReport } from "../src/report.js";
import { createFeatureBranchFixture, type GitFixture } from "./helpers/git-fixture.js";

describe("CLI and MCP return the same review", () => {
  let fixture: GitFixture;
  beforeEach(() => {
    fixture = createFeatureBranchFixture();
  });
  afterEach(() => fixture.cleanup());

  it("MCP structuredContent equals the shared core result, and its text equals the CLI markdown", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createServer({ checks: { greet: "echo hi" } }).connect(serverTransport);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);

    const viaMcp = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: fixture.dir, base_ref: "main", checks: ["greet"] },
    });
    const viaCore = await runReview({ repositoryPath: fixture.dir, baseRef: "main", validationCommands: ["echo hi"] });

    expect(viaMcp.isError).toBeFalsy();
    expect(viaMcp.structuredContent).toEqual(viaCore);
    expect((viaMcp.content as Array<{ text: string }>)[0].text).toBe(markdownReport(viaCore));
  });
});

describe("markdownReport", () => {
  it("keeps output containing ``` inside its code block", () => {
    const report = markdownReport({
      repositoryPath: "/repo",
      baseRef: "main",
      passed: true,
      changedFiles: [],
      validations: [
        { command: "cat README", status: "passed", exitCode: 0, timedOut: false, output: "```\n# not a heading\n```" },
      ],
    });

    // The fence must be longer than any backtick run inside the output.
    expect(report).toContain("````\n```\n# not a heading\n```\n````");
  });
});
