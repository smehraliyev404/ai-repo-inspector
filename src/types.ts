import { z } from "zod";

/**
 * The review result is the single contract shared by every interface: the CLI
 * prints it as JSON or renders it as Markdown, and MCP returns it as
 * structuredContent (validated against this schema) plus the same Markdown.
 */
export const changedFileSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted", "renamed", "untracked"]),
  /** Set for renames: the path before the rename. */
  previousPath: z.string().optional(),
});

export const validationResultSchema = z.object({
  command: z.string(),
  status: z.enum(["passed", "failed"]),
  /** null when the process did not exit normally (failed to start or killed by a signal). */
  exitCode: z.number().int().nullable(),
  /** true when the command was killed for exceeding the time limit. */
  timedOut: z.boolean(),
  /** Combined stdout/stderr, capped in size (middle dropped when too long). */
  output: z.string(),
});

export const reviewResultSchema = z.object({
  repositoryPath: z.string(),
  /** The base ref the diff was taken against (as given, or the detected default). */
  baseRef: z.string(),
  /** true when every validation passed (also true when none were run). */
  passed: z.boolean(),
  changedFiles: z.array(changedFileSchema),
  validations: z.array(validationResultSchema),
});

export type ChangedFile = z.infer<typeof changedFileSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
};
