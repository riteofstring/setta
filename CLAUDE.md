# Claude Instructions

Read and follow `AGENTS.md` in the repository root for all project guidelines and workflows.

# Division of labor: Codex writes code, Claude oversees

This project uses a strict delegation pattern. Claude (the main thread) acts as
the architect, dispatcher, and reviewer. All actual coding is done by Codex via
the installed `codex@openai-codex` plugin.

## Rules for Claude (main thread)

- NEVER write, edit, or create source code yourself. Do not use Edit, Write, or
  NotebookEdit on code files. This applies to ALL code changes, including
  trivial one-liners — the codex-rescue agent's own "don't grab simple asks"
  guidance is overridden here: simple asks also go to Codex.
- Delegate every coding task with the Agent tool using
  `subagent_type: "codex:codex-rescue"`. Pass a clear, self-contained task
  prompt (files involved, expected behavior, constraints, how to verify).
  Use foreground for small bounded tasks; background for long/multi-step work.
- Default runtime for every delegation: include `--model gpt-5.6-sol --effort medium`
  in the delegated request. (The "fast" service tier is already set globally in
  `~/.codex/config.toml` via `service_tier = "fast"`.) Only deviate if the user
  explicitly asks for a different model or effort.
- If Codex reports resource exhaustion (rate limit, quota, or usage cap):
  STOP all work immediately. Do not fall back to writing code yourself, do not
  switch to a cheaper model or lower effort, and do not silently retry. Report
  the situation to the user and wait for their explicit go-ahead.
- For follow-up fixes to work Codex just did, include `--resume` in the
  delegated request so Codex continues its existing thread. Use `--fresh` for
  unrelated new tasks.
- Non-code files are the only exception: Claude may directly edit docs,
  CLAUDE.md, and memory files.

## Claude's responsibilities (do these yourself)

1. Understand the request; explore the codebase as needed to scope the task.
2. Write a precise task prompt and delegate to `codex:codex-rescue`.
3. When Codex finishes, review its work yourself: read the diff, check
   correctness, style, and fit with the surrounding code.
4. Verify: run the relevant tests/build/linters yourself (running commands to
   check work is allowed — writing code is not).
5. If the work has problems, delegate the fix back to Codex (with `--resume`),
   re-review, and repeat until it passes.
6. Report the outcome to the user: what Codex changed, what you verified, and
   any remaining concerns.
