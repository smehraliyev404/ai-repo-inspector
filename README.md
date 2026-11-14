# Repository Inspector

This is a small TypeScript developer tool that inspects changes in a Git
repository, runs optional validation commands, and produces a Markdown report.
It can be used from a command line or exposed to AI clients through MCP.

## Your task

Investigate the repository and improve it as you judge best. The starter works
for a narrow happy path, but production use may expose correctness, safety,
reliability, contract, output, documentation, or testing weaknesses.

You are not expected to finish everything. We care about how you investigate,
prioritize, implement, verify, and explain a meaningful scope.

## Product decision

This tool may be used directly by developers and by AI coding agents. Decide
whether its production interface should be **CLI-first**, **MCP-first**, or
**hybrid**. Implement improvements consistent with your decision.

There is no preferred label. Explain:

- The primary user and execution environment you assumed.
- The trust boundary and allowed capabilities.
- Reliability, discoverability, latency/context, and output-size tradeoffs.
- How the interfaces you continue to advertise stay behaviorally consistent.
- What evidence would change your decision.

## Time and rules

- Maximum **90 focused minutes** within 48 hours of receiving the invitation.
- Use AI coding tools freely. Verify their work and document at least one
  suggestion you corrected or rejected.
- Work in your own repository created from this template.
- Commit as you work and complete `SUBMISSION.md` in your final commit.
- Completion is not required. Accurate scope and verification matter more than
  a large diff.

## Setup

```bash
npm install
npm run typecheck
npm test
```

## CLI

```bash
npm run inspector -- review --repo ./path/to/repo --format markdown
npm run inspector -- review --repo ./path/to/repo --validate "npm test"
```

The report is written to `review-report.md` (change with `--output <file>`, or
`--output -` for stdout). `--format json` emits the same structured result the
MCP tool returns. `--base-ref` defaults to `origin/HEAD`, then `main`, then
`master`. Changed files include committed branch work, uncommitted edits and
untracked files.

Exit codes: `0` review done and all checks passed, `1` a check failed or the
review could not run, `2` invalid arguments.

## MCP

Start the stdio server with:

```bash
npm run mcp-server
```

It exposes a `review_repository` tool. Inspect the implementation to determine
its current input contract and whether it is suitable for the production model
you propose.

### Checks (MCP)

The MCP caller is an AI agent, so it cannot send command text. The person who
starts the server decides which checks exist; the agent can only ask for them
by name:

```bash
npm run mcp-server -- --check "test=npm test" --check "typecheck=npm run typecheck"
```

The agent then calls `review_repository` with
`{"repo_path": "...", "base_ref": "main", "checks": ["test"]}` (only `repo_path`
is required). The result is returned twice: as `structuredContent` (validated
against the same schema as `--format json`, see `src/types.ts`) and as the same
Markdown the CLI writes. A failing check is a normal result (`passed: false`);
`isError` is used only when the review itself could not run.
The tool description lists the available names. Unknown check names and unknown
fields (such as the removed `validationCommands`) are rejected with an error.
With no `--check` flags, the server runs no checks: only read-only git queries,
with `core.fsmonitor` disabled so the inspected repo's own git config cannot
start a command. `repo_path` is not restricted yet, so a configured check can
be run in any repository the server user can access.

The CLI keeps `--validate "<command>"`: there the developer typing the command
is the trust root, so arbitrary commands are expected.

## Project layout

```text
src/core.ts         shared review orchestration
src/cli.ts          command-line adapter
src/mcp-server.ts   MCP adapter
src/git.ts          Git inspection
src/validation.ts   validation execution
src/report.ts       Markdown report generation
test/               public starter tests
```

When finished, submit via **Security → Report a vulnerability** on this
repo — see `SECURITY.md` for exactly what to include. Do not reply by email;
that submission channel is not monitored.