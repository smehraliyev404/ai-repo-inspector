import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/mcp-server.js";
import { createFeatureBranchFixture, type GitFixture } from "./helpers/git-fixture.js";

async function connectClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((part) => part.text ?? "").join("\n");
}

describe("MCP review_repository", () => {
  let fixture: GitFixture;
  beforeEach(() => {
    fixture = createFeatureBranchFixture();
  });
  afterEach(() => fixture.cleanup());

  it("reviews the repository passed in repo_path, not the server's working directory", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: fixture.dir },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("`feature.txt` (added)");
    expect(textOf(result)).not.toContain("undefined");
  });

  it("returns a tool error for a path that does not exist", async () => {
    const client = await connectClient();
    const missing = join(fixture.dir, "does-not-exist");
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: missing },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("does not exist");
  });

  it("returns a tool error for a directory that is not a git repository", async () => {
    const plainDir = mkdtempSync(join(tmpdir(), "inspector-not-a-repo-"));
    try {
      const client = await connectClient();
      const result = await client.callTool({
        name: "review_repository",
        arguments: { repo_path: plainDir },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("not a git repository");
    } finally {
      rmSync(plainDir, { recursive: true, force: true });
    }
  });
});
