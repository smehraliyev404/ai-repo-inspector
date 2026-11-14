import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ReviewInputError } from "./errors.js";
import { changedFiles, isGitRepository } from "./git.js";
import { markdownReport } from "./report.js";
import type { ReviewRequest } from "./types.js";
import { runValidations } from "./validation.js";

export { ReviewInputError };

/** Resolves the requested path and fails loudly instead of inspecting some other directory. */
export function resolveRepositoryPath(repositoryPath: string | undefined): string {
  if (typeof repositoryPath !== "string" || repositoryPath.trim() === "") {
    throw new ReviewInputError("Repository path is required.");
  }
  const absolutePath = resolve(repositoryPath);
  if (!existsSync(absolutePath)) {
    throw new ReviewInputError(`Repository path does not exist: ${absolutePath}`);
  }
  if (!statSync(absolutePath).isDirectory()) {
    throw new ReviewInputError(`Repository path is not a directory: ${absolutePath}`);
  }
  if (!isGitRepository(absolutePath)) {
    throw new ReviewInputError(`Repository path is not a git repository: ${absolutePath}`);
  }
  return absolutePath;
}

export async function reviewRepository(request: ReviewRequest): Promise<string> {
  const repositoryPath = resolveRepositoryPath(request.repositoryPath);
  const files = changedFiles(repositoryPath, request.baseRef);
  const validations = await runValidations(request.validationCommands ?? [], repositoryPath);
  return markdownReport({
    repositoryPath,
    changedFiles: files,
    validationResults: validations,
  });
}
