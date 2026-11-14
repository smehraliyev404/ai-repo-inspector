# Submission

## What did you investigate first, and why?

I first ran the setup (`npm install`, `npm run typecheck`, `npm test`: all green,
1 test) and read every file in `src/`, because with one happy-path test the
green build said little. I then reproduced suspected problems against real
inputs before ranking them, so the priority list is based on evidence, not
guesses:

- MCP over real stdio with `repo_path: "/does/not/exist"` returned a report
  titled `Review Report: undefined` (schema says `repo_path`, handler read
  `repoPath`, typed `any`), so it silently reviewed the server's own cwd.
- The same call with `validationCommands: ["echo PWNED-from-$(whoami)"]`
  printed my username: any MCP caller could run any shell command.
- CLI: a failing `--validate` crashed the whole review, >1 MB of output crashed
  with `maxBuffer`, `--repo` with a space failed, `--format json` was ignored,
  non-git paths produced a raw stack trace.

I ranked by **trust boundary first** (who can trigger it: an AI agent is
less trusted than the developer at the keyboard), then by **wrong results**
(silent wrong repo, failed checks invisible), then robustness and polish.

## What did you choose to implement or fix?

One commit per fix; each started with a failing test that reproduced the bug.

1. **MCP ignored `repo_path`** (`d23dd82`). Input is now typed from the zod
   schema (the mismatch becomes a compile error); the shared core rejects
   missing / non-directory / non-git paths with a clear message; MCP returns
   `isError` results instead of throwing.
2. **Arbitrary command execution via MCP** (`a651d6c`). The agent can no longer
   send command text. The operator who starts the server defines named checks
   (`--check "test=npm test"`); the agent picks names (`checks: ["test"]`),
   which are advertised in the tool description. No `--check` → no commands
   run at all. Input schema is `.strict()`, so the removed field is rejected
   loudly instead of silently ignored.
3. **Failing validation crashed the review** (`8cf917a`). Non-zero exit is now
   a `failed` result with its exit code; stdout+stderr are kept in order; later
   checks still run.
4. **No timeout / unbounded output** (`068ff43`). 5-minute default timeout that
   kills the whole process group (so background children cannot keep the
   pipes open); output capped at 32 KB in bounded memory, keeping the start
   and the end (where test summaries are).
5. **Git inspection** (`c0baa74`). Found while fixing: `baseRef` was passed as
   `${baseRef}...HEAD`, so `--output=/path` made **git write a file** (agent-
   controlled via MCP → arbitrary file write; proven by a test against the
   old code). Refs are now verified with `rev-parse --verify --end-of-options`
   and only the SHA reaches `git diff`. Also: default base `origin/HEAD` →
   `main` → `master` instead of hard-coded `main`; uncommitted and untracked
   files are included; `-z` parsing keeps unusual paths verbatim; renames
   reported as `renamed` with the old path.
6. **One shared, structured result** (`9cb6588`). `runReview()` returns a
   zod-defined `ReviewResult`; the CLI renders it as Markdown or `--format json`,
   MCP returns it as validated `structuredContent` plus the identical Markdown.
   CLI: real exit codes (0/1/2), strict argument parsing, paths with spaces,
   `--output`. MCP fields made consistently snake_case (`repo_path`,
   `base_ref`, `checks`). Report fences can no longer be broken by backticks.

## What did you intentionally not do?

- **Restricting which repositories MCP may target** (an operator
  `--allow-root`). This is the main remaining security gap: the agent chooses
  `repo_path`, so once the operator configures a check like `test=npm test`,
  the agent can run that check in *any* git repository the server user can
  reach, i.e. execute that repository's code. Without configured checks the
  exposure is reading file names. I left it out only for time; it is next
  step 1 below.
- **Sandboxing the checks themselves.** An allowed check like `npm test` still
  runs the repository's own code; making that safe needs a container, which is
  out of scope. Documented as the operator's decision.
- **Windows support** for the process-group kill, and exposing the timeout /
  output limits as flags.
- Diff *content* review (the tool lists files, it does not review code).

## Interface decision

- **Decision: hybrid**: one core (`runReview`) and one result schema, two thin
  adapters with **different trust levels**.
- **Primary user and execution environment:** AI coding agents calling the
  tool over MCP stdio on a developer's machine or in CI, while they work in a
  repo; plus developers and CI scripts using the CLI directly.
- **Trust boundary and allowed capabilities:** the CLI user is the trust root
  (it is their shell), so `--validate "<any command>"` stays. The MCP caller is
  an agent whose input can be steered by prompt injection from the very repo
  it reads, so over MCP it may only: name a repo path, name a base ref
  (verified, never parsed as an option), and pick checks the human operator
  pre-approved by name. It cannot supply command text or extra fields. Git
  runs with `core.fsmonitor=false`, because the inspected repo's own
  `.git/config` is untrusted too. Gap: `repo_path` is not yet restricted, so a
  pre-approved check can be run in any repo (see "not do" above).
- **Reliability, discoverability, latency/context, and output tradeoffs:**
  MCP is discoverable (schema + tool description lists available checks) and
  returns structured data, so the agent does not parse Markdown. Output is
  capped per check (32 KB, head+tail) to protect the agent's context and
  memory; the trade-off is that the middle of very long logs is dropped (marked
  in the output). Timeouts trade completeness for never hanging the agent.
  The CLI is simpler to script and debug, with exit codes for CI.
- **How supported interfaces remain consistent:** both adapters call the same
  `runReview()`, and the result type is one zod schema (`src/types.ts`) used as
  MCP `outputSchema` and as the CLI JSON shape. `test/consistency.test.ts`
  asserts MCP `structuredContent` deep-equals the core result and MCP text
  equals the CLI Markdown.
- **Evidence that would change this decision:** if usage showed nearly all
  calls come from agents, I would go MCP-first and keep the CLI as a thin
  debugging wrapper; if agents mostly run in sandboxed CI containers where
  arbitrary commands are already isolated, free-form commands over MCP could
  be reconsidered; if almost nobody uses MCP, CLI-first with JSON output would
  be simpler to maintain.

## How did you use an AI coding agent?

I used Claude Code as the main implementer: it swept the codebase,
reproduced the issues, and wrote fixes and tests. I set the rules and made the
decisions: agreed scope and priority, chose the interface model, required a
failing test before every fix, chose self-contained test fixtures (temp repos
created by the tests, never touching my git config) over loosening my local
permission rules, and reviewed and committed each fix myself as one commit.

## Where did you check, correct, or reject an AI suggestion? (required)

- **Silent field drop.** The first version of the MCP lockdown removed
  `validationCommands` but the SDK silently stripped unknown fields: tests
  passed, yet an agent sending the old field would get a report and believe
  its checks ran. Caught in the agent's stdio verification step; changed to a
  `.strict()` schema that rejects it, and the test now asserts the rejection.
- **A test that could not fail.** The first option-injection test checked for
  a file named `written-by-git`, but the old code would create
  `written-by-git...HEAD`, so the test would pass even with the bug present.
  Caught by the agent on re-reading its test; rewritten to check by prefix and
  confirmed red against the old code before the fix. Lesson: a passing AI-written test is not evidence until it has been
  seen failing.
- **Edge case in AI code.** The bounded output buffer crashed (uncaught
  `TypeError` inside a stream handler) with a zero byte budget; vitest still
  reported the test as passing. Found when the agent re-read its own code
  during review; added a test, then fixed.

- **CI failure the agent missed (caught by me).** The agent reported the
  structured-output commit as verified (typecheck, build, 36/36 tests), but
  I saw the GitHub Actions run fail afterwards: 7 CLI tests failing in
  `dist/test/cli.test.js`. Cause: CI runs `build` *before* `test`; the build
  compiled the tests into `dist/`, vitest collected those copies too, and in
  them the project root resolved to `dist/`, so the spawned CLI did not exist.
  Locally the agent always deleted `dist/` after building, which hid it. Fix:
  a `tsconfig.build.json` that compiles only `src/` (which also fixed the
  broken `bin` path), a vitest config that only collects `test/**/*.test.ts`,
  and re-verifying in CI's exact order (`npm ci && typecheck && build && test`).
  Lesson: verify in the same order and environment as CI, not just "all green".

- **Second, independent AI review before submitting.** I had a separate agent
  session review the finished work. It found that my own write-up overstated
  safety ("only file names are read", "runs no commands at all") and that the
  inspected repo's `core.fsmonitor` config could run a command. I did not take
  the latter on trust: a test confirmed it (marker file created), then
  `-c core.fsmonitor=false` fixed it, and I rewrote the claims honestly.

The first three were caught by the review process I required (red test first, then
real stdio/CLI runs), mostly by the agent reviewing its own output. That is
why I would not trust an AI change here without seeing its test fail first.

## Commands used to verify the result, with outcomes

- `npm run typecheck` → no errors.
- `npm test` → 8 files, **37 tests passed** (from 1 at the start).
- `npm run build` → emits `dist/cli.js` (matches `bin`); `node dist/cli.js`
  runs a review, and with no arguments prints usage and exits 2.
- CI's exact order, `npm ci && npm run typecheck && npm run build && npm test`
  with `dist/` present → 8 files, 37 tests passed (this order failed before
  the build fix, see above).
- Each fix: new tests run against the old code first → failing for the bug
  (e.g. `expected '# Review Report: undefined…'`, marker file created by an
  injected command, `written-by-git...HEAD` created), then passing.
- MCP over real stdio (`npm run mcp-server`) with JSON-RPC messages:
  bad path → `isError` with a clear message; `validationCommands` →
  `unrecognized_keys` error; configured check → runs; response contains
  `structuredContent`.
- CLI: `--format json --output - --validate "exit 3"` → valid JSON,
  `"passed": false`, exit code 1; `--base-ref "--output=/tmp/x"` →
  `Unknown base ref`, exit 1, no file written; 2 MB of output → 33 KB report
  with `[... 1967232 bytes omitted ...]`; no leftover `sleep` processes after
  timeout tests.

## A blocker you hit and how you approached it

My local agent permissions block git commits outside my own workflow, so
the agent could not create throwaway repos with commits to reproduce git bugs.
Instead of loosening that rule, the tests build their own temporary
repositories (`test/helpers/git-fixture.ts`): created in the OS temp folder,
identity passed per command, deleted after each test. That also made the git
tests reproducible in CI. A smaller one: macOS has no `timeout` command for
the stdio smoke tests, so I relied on the server exiting when stdin closed.

## Known limitations and the next three things you would do

Limitations:
- `repo_path` is unrestricted, so a configured check can run in any repo (above).
- Allowed checks run the repository's code unsandboxed.
- `core.fsmonitor` is the one git-config execution path I closed and tested;
  other repo-config hooks were not audited.
- The changed-file list has no size cap, and MCP sends it twice
  (`structuredContent` and the Markdown text).
- `checks` is not deduplicated or limited in count.
- The 5-minute check timeout exceeds the ~60 s default request timeout of the
  MCP TypeScript SDK client, and there are no progress notifications, so a slow
  check can time out on the client side first.
- Process-group kill is POSIX only; Ctrl-C on the CLI does not kill running
  checks; limits are not configurable from flags; the built `dist/` is only
  smoke-tested by hand.

Next three:
1. Operator `--allow-root` for MCP (reject `repo_path` outside it), with a test.
2. Fit MCP to client limits: cap and dedupe `checks`, cap the file list,
   lower the MCP timeout or send progress notifications; make limits
   configurable on both interfaces through the same shared options.
3. Sandbox option for running checks on untrusted repositories, plus an
   automated smoke test of the built `dist/` CLI and MCP server.

## Approximate focused-work time

- Start: 11:05
- Finish: 12:33