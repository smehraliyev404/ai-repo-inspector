import { existsSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, parseServerArgs, type ServerOptions } from "../src/mcp-server.js";
import { createFeatureBranchFixture, type GitFixture } from "./helpers/git-fixture.js";

async function connectClient(options?: ServerOptions) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(options).connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((part) => part.text ?? "").join("\n");
}

describe("MCP command execution boundary", () => {
  let fixture: GitFixture;
  beforeEach(() => {
    fixture = createFeatureBranchFixture();
  });
  afterEach(() => fixture.cleanup());

  it("does not advertise any field that accepts a free-form command", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const properties = Object.keys(tools[0].inputSchema.properties ?? {});

    expect(properties).not.toContain("validationCommands");
  });

  it("never executes command text supplied by the MCP caller", async () => {
    const marker = join(fixture.dir, "INJECTED");
    const client = await connectClient();
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: fixture.dir, validationCommands: [`touch "${marker}"`] },
    });

    expect(existsSync(marker)).toBe(false);
    // Rejected loudly rather than silently ignored, so the caller cannot think tests ran.
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("validationCommands");
  });

  it("runs a check the server operator allowed, by name", async () => {
    const client = await connectClient({ checks: { greet: "echo hello-from-check" } });
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: fixture.dir, checks: ["greet"] },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("hello-from-check");
  });

  it("rejects a check name the operator did not allow and lists the allowed ones", async () => {
    const client = await connectClient({ checks: { test: "npm test" } });
    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: fixture.dir, checks: ["rm -rf /"] },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unknown check");
    expect(textOf(result)).toContain("test");
  });

  it("advertises the allowed check names to the agent", async () => {
    const client = await connectClient({ checks: { test: "npm test", lint: "npm run lint" } });
    const { tools } = await client.listTools();

    expect(tools[0].description).toContain("test");
    expect(tools[0].description).toContain("lint");
  });
});

describe("parseServerArgs", () => {
  it("reads --check name=command pairs set by the operator", () => {
    expect(parseServerArgs(["--check", "test=npm test", "--check", "lint=npm run lint -- --max-warnings=0"])).toEqual({
      checks: { test: "npm test", lint: "npm run lint -- --max-warnings=0" },
    });
  });

  it("rejects malformed --check values", () => {
    expect(() => parseServerArgs(["--check", "no-equals-sign"])).toThrow(/name=command/);
    expect(() => parseServerArgs(["--check"])).toThrow(/name=command/);
  });
});
