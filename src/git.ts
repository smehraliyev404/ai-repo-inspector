import { execFileSync } from "node:child_process";
import { ReviewInputError } from "./errors.js";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function tryGit(repositoryPath: string, args: string[]): string | undefined {
  try {
    return git(repositoryPath, args).trim();
  } catch {
    return undefined;
  }
}

export function isGitRepository(directory: string): boolean {
  return tryGit(directory, ["rev-parse", "--is-inside-work-tree"]) === "true";
}

/** Resolves a ref to a commit SHA. Refs are never passed to git as options. */
function resolveCommit(repositoryPath: string, ref: string): string | undefined {
  if (ref.startsWith("-")) return undefined;
  return tryGit(repositoryPath, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]);
}

/** Explicit base ref, else the remote's default branch, else local main/master. */
export function resolveBase(repositoryPath: string, baseRef?: string): { ref: string; sha: string } {
  if (baseRef !== undefined) {
    const sha = resolveCommit(repositoryPath, baseRef);
    if (!sha) throw new ReviewInputError(`Unknown base ref: ${baseRef}`);
    return { ref: baseRef, sha };
  }
  const remoteHead = tryGit(repositoryPath, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  for (const candidate of [remoteHead, "main", "master"]) {
    const sha = candidate ? resolveCommit(repositoryPath, candidate) : undefined;
    if (candidate && sha) return { ref: candidate, sha };
  }
  throw new ReviewInputError("Could not find a base branch (origin/HEAD, main or master). Pass a base ref explicitly.");
}

const STATUS_BY_CODE: Record<string, ChangedFile["status"]> = {
  A: "added",
  D: "deleted",
  M: "modified",
  T: "modified",
  R: "renamed",
  C: "added",
};

/** Parses `git diff --name-status -z`: fields are NUL-separated; R/C entries carry two paths. */
function parseNameStatus(output: string): ChangedFile[] {
  const fields = output.split("\0");
  const files: ChangedFile[] = [];
  for (let index = 0; index < fields.length - 1; ) {
    const code = fields[index++][0];
    if (code === "R" || code === "C") {
      const previousPath = fields[index++];
      const path = fields[index++];
      files.push(code === "R" ? { path, previousPath, status: "renamed" } : { path, status: "added" });
    } else {
      files.push({ path: fields[index++], status: STATUS_BY_CODE[code] ?? "modified" });
    }
  }
  return files;
}

/**
 * Files that differ between the merge base of the base branch and the working
 * tree: committed branch work plus staged and unstaged edits, plus untracked
 * files. `-z` output keeps paths verbatim (no quoting of spaces or unicode).
 */
export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = resolveBase(repositoryPath, baseRef).sha;
  const mergeBase = tryGit(repositoryPath, ["merge-base", base, "HEAD"]) ?? base;
  const tracked = parseNameStatus(git(repositoryPath, ["diff", "--name-status", "-z", "-M", mergeBase]));
  const untracked = git(repositoryPath, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .map((path): ChangedFile => ({ path, status: "untracked" }));
  return [...tracked, ...untracked];
}
