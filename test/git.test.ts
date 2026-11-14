import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewInputError } from "../src/core.js";
import { changedFiles } from "../src/git.js";
import { createFeatureBranchFixture, createGitFixture, type GitFixture } from "./helpers/git-fixture.js";

describe("changedFiles", () => {
  const fixtures: GitFixture[] = [];
  const track = (fixture: GitFixture) => (fixtures.push(fixture), fixture);
  afterEach(() => fixtures.splice(0).forEach((fixture) => fixture.cleanup()));

  it("works in a repository whose default branch is master", () => {
    const fixture = track(createGitFixture("master"));
    fixture.write("README.md", "base\n");
    fixture.commitAll("base");
    fixture.git("checkout", "--quiet", "-b", "feature");
    fixture.write("feature.txt", "new\n");
    fixture.commitAll("feature");

    expect(changedFiles(fixture.dir)).toEqual([{ path: "feature.txt", status: "added" }]);
  });

  it("fails clearly for a base ref that does not exist", () => {
    const fixture = track(createFeatureBranchFixture());

    expect(() => changedFiles(fixture.dir, "no-such-branch")).toThrow(ReviewInputError);
    expect(() => changedFiles(fixture.dir, "no-such-branch")).toThrow(/Unknown base ref/);
  });

  it("does not let a base ref be interpreted as a git option", () => {
    const fixture = track(createFeatureBranchFixture());
    const written = join(fixture.dir, "written-by-git");

    // Called without expecting anything first, so the old code's side effect is observable.
    try {
      changedFiles(fixture.dir, `--output=${written}`);
    } catch {
      // asserted below
    }
    expect(readdirSync(fixture.dir).filter((name) => name.startsWith("written-by-git"))).toEqual([]);
    expect(() => changedFiles(fixture.dir, `--output=${written}`)).toThrow(ReviewInputError);
  });

  it("reports renames with the previous path instead of a tab-joined 'modified'", () => {
    const fixture = track(createFeatureBranchFixture());
    fixture.git("mv", "README.md", "GUIDE.md");
    fixture.commitAll("rename");

    expect(changedFiles(fixture.dir)).toContainEqual({
      path: "GUIDE.md",
      previousPath: "README.md",
      status: "renamed",
    });
  });

  it("includes uncommitted edits and untracked files", () => {
    const fixture = track(createFeatureBranchFixture());
    fixture.write("README.md", "edited but not committed\n");
    fixture.write("scratch.txt", "untracked\n");

    const files = changedFiles(fixture.dir);
    expect(files).toContainEqual({ path: "README.md", status: "modified" });
    expect(files).toContainEqual({ path: "scratch.txt", status: "untracked" });
  });

  it("returns unusual file names verbatim (spaces, unicode, backticks)", () => {
    const fixture = track(createFeatureBranchFixture());
    const names = ["with space.txt", "ünïcödé.txt", "tick```name.txt"];
    names.forEach((name) => fixture.write(name, "x\n"));
    fixture.commitAll("odd names");

    const paths = changedFiles(fixture.dir).map((file) => file.path);
    for (const name of names) expect(paths).toContain(name);
  });
});
