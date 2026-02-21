# Project Chat Skills/MCP Viewer Active-Skill Mapping Index

Date: 2026-02-19
Area: frontend
Branch/Commit: skills-mcp-update-1 @ 08c6fa8a (working tree)
Code paths touched:
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.perf.test.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.test.ts`

## Goal

Reduce avoidable CPU cost in active skill resolution by replacing repeated full-scan candidate matching with a precomputed identifier index.

## Scenario

- Entry point: `http://127.0.0.1:3001/dog_foam` (measured via Chrome DevTools MCP `evaluate_script` in page context).
- Synthetic workload mirrors the hot-path logic in `mapActiveSkillNamesToSkillIds`.
- Dataset:
  - 2,000 skill entries
  - 400 active skill tokens
  - 50 iterations per measurement run
- Browser + OS: Chrome (DevTools MCP), macOS.

## Before (baseline)

Measurement method:
- Chrome DevTools MCP `evaluate_script` benchmark of the pre-refactor algorithm (per-token `skills.filter(...)` + repeated identifier-set construction).

Key metrics:
- Average runtime per call: **187.988 ms**

## After

Measurement method:
- Same benchmark script and dataset, but using the refactored algorithm (one-time `Map<identifier, skill[]>` index + O(1) candidate lookup).

Key metrics:
- Average runtime per call: **1.106 ms**
- Relative reduction: **99.41%**
- Improvement factor: **169.97x** faster

## Conclusion

- The index-based mapping removes repeated full-list scans and repeated per-skill identifier set rebuilding from the active-token loop.
- The measured hot path dropped from ~188 ms to ~1.1 ms for the benchmark dataset.
- No functional behavior changes were introduced in candidate tie-breaking.

## Raw Artifacts (local-only)

- No trace file generated for this run; metrics captured directly from DevTools MCP `evaluate_script` output.

## Automated Perf Tests

- Vitest:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.perf.test.ts`
  - Added guard: `active skill mapping scales roughly linearly with large active token sets`
