# Phase 24 Caller-Backed Capability-Gap Inventory And Rerank

## Purpose

This doc records the broader rerank that Phase 23 recommended after the
direct-frontend route-cluster track closed.

Phase 23 established that there was no new caller-backed direct frontend route
cluster left to move. That did not automatically mean the backend rewrite was
finished. The next honest question was:

- do the remaining Go `unsupported` / `unavailable` branches correspond to a
  real caller-backed capability gap that should open the next backend phase?

This doc answers that question using current live callers, earlier landed
phase docs, and the current Python code/tests only as product reference.

## Current Status

Completed before this inventory:

- Phase 22 artifact/file-browser route-cluster closeout
- Phase 23 post-artifact direct-frontend rerank

Current repo status as of 2026-03-10:

- the direct frontend route-cluster track is closed for the current
  caller-backed surface
- the remaining obvious backend gaps are now concentrated in bounded runtime
  branches that still return typed `unsupported` or `unavailable` errors
- those branches need caller evidence before they should drive a new rewrite
  phase

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-23-post-artifact-direct-frontend-route-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`
- `docs/plans/go-backend-rewrite/phase-14-managed-agent-start-stop-runtime-and-transport.md`
- `docs/plans/go-backend-rewrite/phase-14-run-chain-caller-and-progress-closeout.md`
- `docs/plans/go-backend-rewrite/phase-22-ide-artifact-owner-plan.md`
- `backend/setta/terminals/run_code.py`
- `backend/setta/routers/agentic.py`
- `backend/setta/routers/artifact.py`
- `tests/routers/test_agentic_routes.py`
- `tests/routers/test_share_artifacts.py`
- `frontend/src/state/actions/runOrImportCode.ts`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Chat/dictationMode.ts`
- `frontend/src/plugins/restart.ts`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/src/components/Chat/useChatAttachmentManager.ts`
- `frontend/src/components/Params/ParamUIs/DropzoneInput.tsx`
- `frontend/src/state/actions/artifacts.ts`
- `internal/httpapi`
- `internal/app`

## Inventory Method

1. Start from the typed Go `unsupported` / `unavailable` branches that still
   appear in the current HTTP surface.
2. Check whether those branches have a real current frontend caller, not just
   a generated endpoint or an old Python route.
3. Read the relevant Python code/tests only to understand the original product
   behavior and whether the current Go boundary is an intentional clean-break
   decision.
4. Separate three cases:
   - no live caller
   - live caller, but already intentional bounded product behavior
   - live caller with a missing backend capability that should drive the next
     phase

## Findings

### 1. `runCode` CLI-output fallback is not a current caller-backed gap

Current Go boundary:

- `internal/httpapi/terminal_routes.go` still returns
  `unsupported_run_code_cli` when `cliId` is provided

Python reference:

- `backend/setta/terminals/run_code.py` supports a `cliId` branch that sends
  the command through the websocket CLI sender instead of a terminal session

Current caller audit:

- `frontend/src/state/actions/runOrImportCode.ts` always sends `cliId: null`
- current frontend searches only found the generated type definition plus that
  hardcoded `null`
- no current frontend caller was found for the degraded `cliId` path

Rerank implication:

- this is not the next caller-backed backend phase
- reopening it now would broaden scope without a current product dependency

### 2. Managed agent-run and run-chain unavailability is still not forced by a current caller

Current Go boundary:

- `internal/httpapi/agent_run_routes.go` still exposes:
  - `managed_agent_run_unavailable`
  - `run_chain_unavailable`
  - `managed_run_chain_unavailable`
  - `external_run_chain_unavailable`

Earlier phase context:

- Phase 14 already recorded that this surface no longer had a live direct
  frontend caller
- current Go ownership intentionally landed the bounded read/start/stop route
  surface without reopening broader runtime parity

Current caller audit:

- current frontend code uses `route_get_agent_runs` through
  `frontend/src/state/actions/ai.ts`
- current searches did not find live frontend callers for:
  - `route_start_agent_run`
  - `route_stop_agent_run`
  - `route_start_run_chain`
  - `route_stop_run_chain`

Rerank implication:

- the current `503` branches are real, but they do not justify a new phase on
  caller evidence today
- if product work reintroduces a real caller here, reopen this as a targeted
  capability slice instead of treating it as latent route debt

### 3. Some typed unavailable behaviors are already the intended product boundary

Examples with current frontend handling:

- provider dictation
  - `frontend/src/components/Chat/dictationMode.ts` already treats realtime
    transcription support as explicit provider/model capability and reports
    “Realtime transcription is unavailable for this provider/model.”
- plugin restart
  - `frontend/src/plugins/restart.ts` and
    `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx` already
    normalize restart into:
    - programmatic
    - manual
    - unavailable
  - this is a surfaced product behavior, not hidden backend debt
- managed chat thinking
  - the current caller surface already gates managed thinking off and the
    backend explicit reject remains the bounded clean-break rule

Rerank implication:

- do not treat every `unsupported` or `unavailable` code as a rewrite gap
- some of them are the product contract for the current bounded scope

### 4. The remaining unsupported artifact-update types are not current live update callers

Current Go boundary:

- the bounded IDE artifact owner still rejects non-slice update types such as
  `Image` and `ChartData`

Python reference:

- `backend/setta/routers/artifact.py` historically owned a broader artifact
  manager surface

Current caller audit:

- `frontend/src/components/Chat/useChatAttachmentManager.ts` sends `File`
  artifacts
- `frontend/src/components/Params/ParamUIs/DropzoneInput.tsx` sends `File`
  artifacts
- `frontend/src/state/actions/artifacts.ts` only syncs the explicitly owned
  artifact types
- current artifact update callsites found live writes for:
  - `File`
  - `BrushStroke`
  - `DrawAreaLayerItemTransform`
- current searches did not find live `route_update_artifacts(...)` callers for
  `Image` or `ChartData` writes

Rerank implication:

- the remaining unsupported artifact write types are not the next
  caller-backed backend phase
- keep the current bounded owner closed unless a real caller appears

### 5. No new caller-backed backend implementation phase is selected by the current evidence

After the post-Phase-23 capability audit:

- the degraded `cliId` run-code path has no current caller
- managed agent-run / run-chain start-stop unavailability has no current
  caller
- unsupported artifact write types have no current caller
- several visible `unsupported` / `unavailable` states are already explicit
  clean-break product behavior, not hidden Python ownership

That leaves no concrete next executable backend slice selected by current
caller evidence alone.

## Reranked Outcome

1. There is still no new caller-backed backend implementation phase to open
   immediately after Phase 23.
2. The remaining obvious backend gaps are either:
   - dormant
   - intentionally bounded product behavior
   - or broader runtime ownership questions that should not be reopened
     without a concrete caller
3. The roadmap should stop implying that another obvious backend slice is
   waiting just because some typed `unsupported` / `unavailable` branches
   remain in code.

## Decisions Made

- do not reopen `runCode` CLI output fallback without a current caller
- do not reopen managed agent-run or run-chain execution work without a real
  product surface that needs it
- do not broaden artifact ownership beyond the currently caller-backed types
- treat the current typed availability boundaries as valid unless caller
  evidence or product work changes them

## Next Recommended Step

Do not open a generic implementation phase from this inventory alone.

Instead:

- wait for a concrete caller-backed or product-backed capability gap to select
  the next backend slice
- when that happens, open a focused implementation doc from that concrete
  surface instead of inventing a catch-all parity phase
- until then, prefer targeted regression hardening or product-driven slices
  when completed Go owners are touched, rather than reopening backend roadmap
  areas speculatively
