# Ralph Mode Implementation Guide (Pocock + Research Notes)

This document captures how to implement a Ralph loop based on Matt Pocock's current guidance, plus additional practical techniques from broader community research. It is written for a local repo workflow on macOS and is CLI-agnostic, with Codex- and Claude-specific examples.

## Core Principles (What Matt Emphasizes)

1. Ralph is a loop: the same prompt is run repeatedly until done. The loop is intentionally simple.  
2. Use a bash loop (fresh context each iteration), not an in-session plugin that keeps accumulating context.  
3. Store state on disk: a PRD or plan file for tasks, plus a progress log for learnings and handoff between iterations.  
4. One task per iteration, with a commit after each task.  
5. Start human-in-the-loop (HITL), then go AFK after the prompt stabilizes.  
6. Use feedback loops (types/tests/lint) as hard gates.  
7. Keep tasks small and explicit; prioritize risky tasks early; define your quality bar.  
8. Use isolation (Docker sandbox or a dedicated worktree) when running AFK.

## Baseline Repo Layout

You can keep this minimal:

- `PRD.md` (or `IMPLEMENTATION_PLAN.md`): tasks + acceptance criteria
- `progress.txt`: append-only loop memory
- `PROMPT.md`: stable loop instructions
- `scripts/ralph/ralph-once.sh`: one iteration (HITL)
- `scripts/ralph/ralph-loop.sh`: AFK loop with iteration cap

Optional but recommended:

- `Makefile` or `scripts/verify.sh`: a single "go/no-go" verification command
- `scripts/ralph/summary-schema.json`: JSON schema for structured summaries

## Step-by-Step Implementation

### 1. Decide your isolation strategy

- HITL runs can be local.  
- AFK runs should be isolated: Docker sandbox, container, or a dedicated worktree with no credentials.  

If you run Codex locally, avoid broad permissions unless you trust the environment. If you need broad permissions, prefer an isolated runner.

### 2. Create a PRD / plan file

Keep tasks small and checkable. Example Markdown template:

```markdown
# PRD

## Goal
Build <feature>. Done means <clear end state>.

## Tasks
- [ ] Task 1: <small, verifiable change>
- [ ] Task 2: <small, verifiable change>
- [ ] Task 3: <small, verifiable change>

## Acceptance Criteria
- [ ] <clear pass/fail condition>
- [ ] <clear pass/fail condition>
```

Alternate JSON format if you want machine-readable "passes" flags:

```json
[
  {
    "id": "task-1",
    "title": "Add <feature>",
    "acceptanceCriteria": ["<criterion>"],
    "priority": 1,
    "passes": false
  }
]
```

### 3. Create the progress log

Use a plain text file. Append after every iteration.

```text
YYYY-MM-DD: Task <id> done.
Key decisions:
- ...
Files changed:
- ...
Notes for next iteration:
- ...
```

Keep it concise. This is iteration memory, not documentation.

### 4. Choose a single verification command

Ralph works best with one "go/no-go" command that fails fast. Examples:

- `make verify`
- `./scripts/verify.sh`
- `./t.sh` (full test suite)

The agent must run this after each task and only commit if it passes.

### 5. Write PROMPT.md

Make the prompt stable and procedural. Example:

```text
You are operating in a Ralph loop.

Rules:
- Read PRD.md (or IMPLEMENTATION_PLAN.md) and progress.txt.
- Select exactly ONE unchecked task.
- Implement only what is required for that task.
- Run: <YOUR_VERIFY_COMMAND>
- If verification fails, fix and re-run until it passes.
- Commit changes with a concise message.
- Mark the task complete in the PRD and append to progress.txt.
- If no tasks remain, output: <promise>COMPLETE</promise>

Constraints:
- Keep changes small and focused.
- Do not refactor unrelated code.
- Prefer explicit, maintainable solutions over cleverness.
```

### 6. Start with HITL (one iteration)

Create a `scripts/ralph/ralph-once.sh` that runs one loop, then exits.

#### Codex CLI (macOS) example

```bash
#!/usr/bin/env bash
set -euo pipefail

codex exec --full-auto - < PROMPT.md
```

#### Claude Code example

```bash
#!/usr/bin/env bash
set -euo pipefail

claude --permission-mode acceptEdits "@PRD.md @progress.txt $(cat PROMPT.md)"
```

### 7. Move to AFK (loop with limits)

Create `scripts/ralph/ralph-loop.sh` with an iteration cap and completion promise detection.

#### Codex CLI (macOS) example

```bash
#!/usr/bin/env bash
set -euo pipefail

MAX_ITERS="${1:-20}"

for ((i=1; i<=MAX_ITERS; i++)); do
  echo "=== Iteration $i/$MAX_ITERS ==="
  result="$(codex exec --full-auto - < PROMPT.md)"
  echo "$result"

  if echo "$result" | rg -q "<promise>COMPLETE</promise>"; then
    echo "All tasks complete."
    exit 0
  fi
done

echo "Hit MAX_ITERS without completion."
exit 1
```

#### Claude Code + Docker sandbox example

```bash
#!/usr/bin/env bash
set -euo pipefail

MAX_ITERS="${1:-20}"

for ((i=1; i<=MAX_ITERS; i++)); do
  echo "=== Iteration $i/$MAX_ITERS ==="
  result="$(docker sandbox run claude --permission-mode acceptEdits -p \
"@PRD.md @progress.txt $(cat PROMPT.md)")"
  echo "$result"

  if echo "$result" | rg -q "<promise>COMPLETE</promise>"; then
    echo "All tasks complete."
    exit 0
  fi
done
```

### 8. Add structured output (optional, recommended for automation)

If you want machine-checkable output, use a schema and capture the final message. This allows a script to verify that a run actually completed one task and passed tests.

Example schema:

```json
{
  "type": "object",
  "properties": {
    "task_id": { "type": "string" },
    "passed_verify": { "type": "boolean" },
    "commit_sha": { "type": "string" },
    "next_task": { "type": "string" }
  },
  "required": ["task_id", "passed_verify", "commit_sha"],
  "additionalProperties": false
}
```

Then run:

```bash
codex exec --full-auto \
  --output-schema scripts/ralph/summary-schema.json \
  -o scripts/ralph/summary.json \
  - < PROMPT.md
```

## Practical Guidance (What Usually Improves Reliability)

- **Fresh context** each iteration is the point of Ralph. Avoid in-session loops.  
- **Small tasks** converge faster and reduce context rot.  
- **Feedback loops** (tests, types, lint) are mandatory. If they fail, do not commit.  
- **Explicit quality bar** in prompt or `AGENTS.md` keeps the agent from taking shortcuts.  
- **Commit each task** to build a clear history and reduce re-exploration.  
- **Start HITL** to tune the prompt before going AFK.  

## Setta-Specific Verify Candidates

If you want a single verification command for this repo, these are common choices:

- `./t.sh` (full suite)
- `./t.sh --b` (backend only)
- `./t.sh --f` (frontend + Playwright)
- `./scripts/run_backend_tests.sh`
- `pnpm -C frontend exec vitest run <path>`

Pick exactly one for the loop and encode it in `PROMPT.md`.

## Suggested Next Steps

1. Decide your PRD format (Markdown checklist vs JSON).
2. Choose your single verification command.
3. Create `PROMPT.md`, `PRD.md`, and `progress.txt`.
4. Add `scripts/ralph/ralph-once.sh` and `scripts/ralph/ralph-loop.sh`.
5. Run HITL once, refine prompt, then run AFK with a small iteration cap.
