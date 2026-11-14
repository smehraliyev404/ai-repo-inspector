#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ReviewInputError, reviewRepository } from "./core.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

  server.registerTool(
    "review_repository",
    {
      description: "Inspects a Git repository and returns a review report.",
      inputSchema: {
        repo_path: z.string().min(1).describe("Path of the Git repository to inspect."),
        baseRef: z.string().optional(),
        validationCommands: z.array(z.string()).optional(),
      },
    },
    // Input is typed from the schema above, so a field-name mismatch is now a compile error.
    async ({ repo_path, baseRef, validationCommands }) => {
      try {
        const report = await reviewRepository({
          repositoryPath: repo_path,
          baseRef,
          validationCommands,
        });
        return { content: [{ type: "text", text: report }] };
      } catch (error) {
        const message =
          error instanceof ReviewInputError
            ? error.message
            : `Review failed: ${error instanceof Error ? error.message : String(error)}`;
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    },
  );

  return server;
}

// Only start the stdio transport when run directly, so tests can import createServer().
const entry = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  await createServer().connect(new StdioServerTransport());
}
