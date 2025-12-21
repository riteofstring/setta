# Plan: Make LLMs Understand Setta Deeply

## Goals
- LLMs consistently choose the correct Setta surface (sections, generated code, listeners, artifacts).
- Reduce repeated tool searches and “no-match” tool errors.
- Improve time-to-first-correct-tool-call and overall task success rate.

## Success Metrics (baseline, then track)
- Tool search count per user request.
- Tool error rate (invalid args, missing IDs, NO_MATCH signatures).
- Time to first tool call + time to first successful tool call.
- Chat completion rate for top workflows (section creation, code wiring, listener updates).

## Plan Overview

## Current Progress
- Step 1: Completed. The system prompt now includes the generated code pipeline, `state`/`SettaState` naming, dependency-expression rules, a “where code goes” map, explicit tool-call sequences, a don't-do list, and canonical examples.
- Step 2: Not started.
- Step 3: Not started.
- Step 4: Not started.
- Step 5: Not started.

### 1) Upgrade the Setta Knowledge Pack (system prompt)
**Why:** The model needs precise “where to write code” and “how to update state” rules.

**Changes**
- Expand `backend/setta/mcp/system_prompt.md` with:
  - A “Where code goes” map (GenPythonCode vs Code vs prefix/suffix).
  - Concrete tool-call sequences for common flows (create section → set params → bind code).
  - Don’t-do list (no direct file writes, no guessing IDs).
  - Short, canonical examples with correct tool schemas and IDs.

**Deliverable**
- A revised system prompt that is concise but decision-focused.

### 2) Inject Dynamic Project Context into Chat
**Why:** Static prompts are not enough; the model needs the active project structure.

**Changes**
- Add a compact, model-friendly project summary in `backend/setta/llm/llm_chat_manager.py`:
  - Active sections (id, type, name).
  - Code bindings and callable targets.
  - Key variants and pinned params.
- Keep the summary short; prefer a stable schema.

**Deliverable**
- Updated system prompt builder to include a per-chat, per-request summary.

### 3) Reduce Tool-Search Friction
**Why:** Models currently search multiple times to find a single tool.

**Changes**
- Enrich search text in `backend/setta/mcp/server.py`:
  - Add synonyms and common verbs to tool documents.
  - Include a short “category” descriptor (layout, code, artifacts, etc.).
- In `backend/setta/mcp/tools/tool_search.py`:
  - Return short descriptions with tool names (or add a companion tool for details).
  - Raise default limits for broader first-pass results.

**Deliverable**
- Improved tool discovery that usually succeeds with one search.

### 4) Pre-unlock Tool Groups by Context
**Why:** The chat should already have the likely tools when the first action is needed.

**Changes**
- In `backend/setta/llm/llm_chat_manager.py`, detect likely workflows from:
  - User message keywords.
  - Active section types.
- Auto-unlock tool groups (e.g., layout, sections, code wiring, artifacts).

**Deliverable**
- Lower tool-search counts and faster first tool calls.

### 5) Add Playbooks + Evaluation Harness
**Why:** We need a stable way to check regressions and iterate quickly.

**Changes**
- Create a set of “golden tasks” with expected tool sequences.
- Log tool usage and compare to the expected flow.
- Run these tasks after prompt/tool changes.

**Deliverable**
- A light-weight evaluation loop to guide prompt and tooling improvements.

## Suggested Rollout
1) System prompt expansion + per-request project summary.
2) Tool search indexing upgrades + higher default limits.
3) Pre-unlock common tool groups.
4) Add playbooks and regression evaluation.

## Open Questions
- Which 5–10 workflows are most critical to improve first?
- Do we want a dedicated “project summary” init tool instead of injecting it in the system prompt?
- Should tool search return tool descriptions by default or via a separate tool?
