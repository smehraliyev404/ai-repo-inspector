#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { ReviewInputError, runReview } from "./core.js";
import { jsonReport, markdownReport } from "./report.js";

const USAGE = `Usage: inspector review --repo <path> [--base-ref <ref>] [--validate <command>]...
                        [--format markdown|json] [--output <file>|-]

  --validate  Shell command to run in the repository (repeatable). Runs with your
              permissions, exactly as if you typed it.
  --output    Where to write the report (default: review-report.md; "-" for stdout).

Exit codes: 0 = review done and all checks passed, 1 = a check failed or the
review could not run, 2 = invalid arguments.`;

class UsageError extends Error {}

type Args = {
  repositoryPath: string;
  baseRef?: string;
  format: "markdown" | "json";
  output: string;
  validations: string[];
};

function parseArgs(argv: string[]): Args {
  if (argv[0] !== "review") throw new UsageError(USAGE);
  const args: Partial<Args> & { validations: string[] } = { validations: [] };
  for (let index = 1; index < argv.length; index++) {
    const option = argv[index];
    const takeValue = () => {
      const value = argv[++index];
      if (value === undefined) throw new UsageError(`${option} needs a value.\n\n${USAGE}`);
      return value;
    };
    switch (option) {
      case "--repo":
        args.repositoryPath = takeValue();
        break;
      case "--base-ref":
        args.baseRef = takeValue();
        break;
      case "--format": {
        const format = takeValue();
        if (format !== "markdown" && format !== "json") {
          throw new UsageError(`--format must be "markdown" or "json", got "${format}".`);
        }
        args.format = format;
        break;
      }
      case "--output":
        args.output = takeValue();
        break;
      case "--validate":
        args.validations.push(takeValue());
        break;
      default:
        throw new UsageError(`Unknown option: ${option}\n\n${USAGE}`);
    }
  }
  if (!args.repositoryPath) throw new UsageError(USAGE);
  return { format: "markdown", output: "review-report.md", ...args } as Args;
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  const result = await runReview({
    repositoryPath: args.repositoryPath,
    baseRef: args.baseRef,
    validationCommands: args.validations,
  });
  const rendered = args.format === "json" ? jsonReport(result) : markdownReport(result);
  if (args.output === "-") {
    process.stdout.write(rendered);
  } else {
    writeFileSync(args.output, rendered, "utf8");
    console.error(`Review report written to ${args.output}`);
  }
  return result.passed ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof ReviewInputError ? `Error: ${error.message}` : `Fatal error: ${error}`);
    process.exitCode = 1;
  },
);
