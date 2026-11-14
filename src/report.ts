import type { ChangedFile, ValidationResult } from "./types.js";

type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

export function markdownReport(input: ReportInput): string {
  const lines = [`# Review Report: ${input.repositoryPath}`, "", "## Changed files"];
  for (const file of input.changedFiles) {
    const from = file.previousPath ? ` from ${file.previousPath}` : "";
    lines.push(`- ${file.path} (${file.status}${from})`);
  }
  lines.push("", "## Validation output");
  for (const result of input.validationResults) {
    const exit = result.timedOut
      ? "timed out"
      : result.exitCode === null
        ? "no exit code"
        : `exit code ${result.exitCode}`;
    lines.push(`### ${result.command} — ${result.status} (${exit})`, "```", result.output, "```");
  }
  return lines.join("\n");
}