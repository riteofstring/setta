# Setta agentic progress assessment (2026-01-19)

Updated on January 19, 2026 after session persistence + preflight fixes.

This document summarizes current implementation status against:
- `docs/plans/setta-agentic-plan.md`
- `docs/plans/setta-external-tools-plan.md`

## Snapshot

### Implemented (core primitives + early UX)
- Agent primitives: `AgentProfile`, `AgentRun`, `RunEvent`, storage paths, CRUD routes, watchers.
- `AgentRunner` with tool allowlists, sub-agent runs, managed tool execution, AIFollow support, and run logging.
- Prompt assets + prompt section: template storage, watcher, Jinja rendering, prompt section type + project manager mutations, codegen/value codec, UI layout + settings.
- External agents foundation: config storage + preflight checks, external runner, SDK sidecars for Claude/Codex/OpenCode, external chat hooks in Project Chat + Chat sections.
- External agent session continuity: session/thread IDs are persisted to run outputs and reused per chat + config; tests cover inheritance + persistence.
- Preflight reliability fixes: Node version parsing corrected and Claude CLI is no longer required for SDK-only runs; tests updated to avoid mocks.

### In progress / partial
- Preflight UX: backend endpoint exists (`/getExternalAgentHealth`) but UI does not surface it.

### Not started (from plan)
- Eval harness, run history/trace UI, context/memory controls, external agent skill UI, Node/runtime bundling for wheels.

## Key blockers and risks
- **Prompt watcher blind spot**: manual creation of new prompt JSON files won’t hot‑reload without a refresh.

## Cleanup recommended before deeper work
1) (Optional) Watch the prompt templates directory or periodically refresh to catch newly added files.

## Suggested next steps
- Add frontend preflight visibility for external agents before expanding adapters.
