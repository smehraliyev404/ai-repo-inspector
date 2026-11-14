export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  /** Set for renames: the path before the rename. */
  previousPath?: string;
};

export type ValidationResult = {
  command: string;
  status: "passed" | "failed";
  /** null when the process did not exit normally (failed to start or killed by a signal). */
  exitCode: number | null;
  /** true when the command was killed for exceeding the time limit. */
  timedOut: boolean;
  /** Combined stdout/stderr, capped in size (middle dropped when too long). */
  output: string;
};

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
  format?: "markdown" | "json";
};