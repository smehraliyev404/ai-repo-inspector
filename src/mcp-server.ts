#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ReviewInputError, reviewRepository } from "./core.js";

/**
 * Trust boundary: the MCP caller is an AI agent whose input may be steered by
 * prompt injection (e.g. text inside the repository it is reviewing). It may only
 * choose check *names*. The command behind each name is set by the human who
 * starts the server (`--check name=command`), never by the caller.
 */
export type ServerOptions = {
  checks?: Record<string, string>;
};

export function parseServerArgs(argv: string[]): ServerOptions {
  const checks: Record<string, string> = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] !== "--check") continue;
    const value = argv[++index];
    const separator = value?.indexOf("=") ?? -1;
    if (!value || separator <= 0 || separator === value.length - 1) {
      throw new Error(`--check expects name=command, got: ${value ?? "(nothing)"}`);
    }
    checks[value.slice(0, separator)] = value.slice(separator + 1);
  }
  return { checks };
}

function describeTool(checkNames: string[]): string {
  const checksText =
    checkNames.length > 0
      ? `Available checks (pass names in \`checks\`): ${checkNames.join(", ")}.`
      : "No checks are configured on this server, so only changed files are reported.";
  return `Inspects a Git repository and returns a review report. ${checksText}`;
}

export function createServer(options: ServerOptions = {}): McpServer {
  const allowedChecks = options.checks ?? {};
  const checkNames = Object.keys(allowedChecks);
  const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

  server.registerTool(
    "review_repository",
    {
      description: describeTool(checkNames),
      // strict(): unknown fields (e.g. the removed `validationCommands`) are rejected, not
      // silently dropped, so a caller never believes a check ran when it did not.
      inputSchema: z
        .object({
          repo_path: z.string().min(1).describe("Path of the Git repository to inspect."),
          baseRef: z.string().optional(),
          checks: z
            .array(z.string())
            .optional()
            .describe("Names of operator-configured checks to run. Command text is not accepted."),
        })
        .strict(),
    },
    // Input is typed from the schema above, so a field-name mismatch is a compile error.
    async ({ repo_path, baseRef, checks }) => {
      try {
        const unknown = (checks ?? []).filter((name) => !Object.hasOwn(allowedChecks, name));
        if (unknown.length > 0) {
          const available = checkNames.length > 0 ? checkNames.join(", ") : "none configured";
          throw new ReviewInputError(`Unknown check(s): ${unknown.join(", ")}. Available: ${available}.`);
        }
        const report = await reviewRepository({
          repositoryPath: repo_path,
          baseRef,
          validationCommands: (checks ?? []).map((name) => allowedChecks[name]),
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
  await createServer(parseServerArgs(process.argv.slice(2))).connect(new StdioServerTransport());
}
