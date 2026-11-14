import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ReviewInputError } from "./errors.js";
import { changedFiles, isGitRepository, resolveBase } from "./git.js";
import type { ReviewRequest, ReviewResult } from "./types.js";
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

/** The one review implementation behind every interface. Rendering is the adapters' job. */
export async function runReview(request: ReviewRequest): Promise<ReviewResult> {
  const repositoryPath = resolveRepositoryPath(request.repositoryPath);
  const base = resolveBase(repositoryPath, request.baseRef);
  const files = changedFiles(repositoryPath, base.sha);
  const validations = await runValidations(request.validationCommands ?? [], repositoryPath);
  return {
    repositoryPath,
    baseRef: base.ref,
    passed: validations.every((validation) => validation.status === "passed"),
    changedFiles: files,
    validations,
  };
}
