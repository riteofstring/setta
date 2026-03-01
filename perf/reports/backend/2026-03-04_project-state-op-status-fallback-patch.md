# Project-State Op-Status Fallback Patch

Date: 2026-03-04
Area: backend
Branch/Commit: setta.backend-performance (working tree)

## Goal

Reduce websocket payload size for backend routes that complete frontend operations without producing a structural/code/project-config patch payload.

## Scenario

- Entry point (URL/route/screen): Project websocket state sync path (`UpdateFrontendProjectState` fallback vs op-status patch).
- Steps to reproduce (keep deterministic):
1. Boot a real project manager fixture.
2. Create 100 top-level dict sections.
3. Serialize a fallback full snapshot message (`WebsocketMsgUpdateFrontendProjectState`) and an op-status-only message (`WebsocketMsgPatchFrontendProjectStateOpStatus`) for the same revision/op-id.
4. Compare JSON payload byte lengths.
- Data set / project used: `tests.utils.manager_fixture.real_project_manager` seeded workspace + 100 created sections.
- Browser + OS: N/A (backend serialization benchmark), macOS.
- Notes (extensions, throttling, dev/prod build, etc): Serialized via pydantic `model_dump_json()`.

## Before (baseline)

- Measurement method (DevTools panels used, settings): Python serialization length of fallback snapshot websocket message.
- Key metrics:
- Snapshot payload bytes: `188222`
- Observations:
- No-op/fallback paths still paid full project-state transport cost.

## After

- Key metrics:
- Op-status patch payload bytes: `226`
- Reduction ratio: `832.8x`
- Payload savings: `99.88%`
- Observations:
- Frontend op completion/reconciliation can be transported without shipping full state snapshots on no-payload paths.

## Conclusion

- What improved:
- Fallback transport now uses a tiny op-status patch message instead of full snapshots for no-payload branches.
- What regressed (if any) + why it is acceptable:
- None observed in targeted backend/frontend/e2e regression runs.
- Follow-ups:
- Expand op-status patch usage to any remaining fallback snapshot paths where no frontend state mutation is needed.

## Raw Artifacts (local-only)

- One-off measurement script run in shell (not persisted as file).

## Automated Perf Tests

- Playwright spec(s): `frontend/tests/e2e/sections/section-undo-redo.spec.ts`
- Vitest test(s) / bench(es):
- `frontend/src/state/actions/sectionInfos.test.ts` (op-status patch reconciliation)
- `frontend/src/state/actions/websocketReceive.test.ts` (op-status patch apply vs resync)
- Budgets/assertions added:
- Websocket op-status patch path must apply without snapshot resync when revisions align.
