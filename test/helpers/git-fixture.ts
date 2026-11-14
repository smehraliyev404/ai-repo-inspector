import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Identity and signing are passed per command so the developer's global git config is never read for them or changed.
const GIT_TEST_CONFIG = [
  "-c", "user.name=Inspector Test",
  "-c", "user.email=inspector-test@example.invalid",
  "-c", "commit.gpgsign=false",
  "-c", "init.defaultBranch=main",
];

export type GitFixture = {
  dir: string;
  git: (...args: string[]) => string;
  write: (file: string, content: string) => void;
  commitAll: (message: string) => void;
  cleanup: () => void;
};

/** Creates a throwaway repository in the OS temp folder. Always call cleanup(). */
export function createGitFixture(defaultBranch = "main"): GitFixture {
  const dir = mkdtempSync(join(tmpdir(), "inspector-fixture-"));
  const git = (...args: string[]) =>
    execFileSync("git", [...GIT_TEST_CONFIG, ...args], { cwd: dir, encoding: "utf8" }).trim();

  git("init", "--quiet", `--initial-branch=${defaultBranch}`);
  const fixture: GitFixture = {
    dir,
    git,
    write: (file, content) => writeFileSync(join(dir, file), content),
    commitAll: (message) => {
      git("add", "--all");
      git("commit", "--quiet", "--message", message);
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
  return fixture;
}

/** A repo with one commit on `main` and a `feature` branch that adds feature.txt. */
export function createFeatureBranchFixture(): GitFixture {
  const fixture = createGitFixture();
  fixture.write("README.md", "base\n");
  fixture.commitAll("base");
  fixture.git("checkout", "--quiet", "-b", "feature");
  fixture.write("feature.txt", "new\n");
  fixture.commitAll("add feature");
  return fixture;
}
