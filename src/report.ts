import type { ReviewResult } from "./types.js";

function longestBacktickRun(text: string): number {
  return Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
}

/** A code fence longer than any backtick run in the content, so output cannot close it early. */
function fence(content: string): string {
  return "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
}

/** Inline code span that survives backticks in file names and commands. */
function code(text: string): string {
  const ticks = "`".repeat(longestBacktickRun(text) + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

export function markdownReport(result: ReviewResult): string {
  const summary = result.validations.length === 0 ? "no checks run" : result.passed ? "all checks passed" : "checks failed";
  const lines = [
    `# Review Report: ${code(result.repositoryPath)}`,
    "",
    `Base: ${code(result.baseRef)} · Result: **${summary}**`,
    "",
    "## Changed files",
  ];
  if (result.changedFiles.length === 0) lines.push("_No changes._");
  for (const file of result.changedFiles) {
    const from = file.previousPath ? ` from ${code(file.previousPath)}` : "";
    lines.push(`- ${code(file.path)} (${file.status}${from})`);
  }
  lines.push("", "## Validation output");
  if (result.validations.length === 0) lines.push("_No checks run._");
  for (const validation of result.validations) {
    const exit = validation.timedOut
      ? "timed out"
      : validation.exitCode === null
        ? "no exit code"
        : `exit code ${validation.exitCode}`;
    const marker = fence(validation.output);
    lines.push(
      `### ${code(validation.command)} — ${validation.status} (${exit})`,
      marker,
      validation.output.replace(/\n$/, ""),
      marker,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function jsonReport(result: ReviewResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
