# Backend Gap Closure Plan

Last updated: `2026-03-18`

Purpose: define the default workflow for future Codex sessions that are
closing remaining Go backend parity gaps.

## Core Rule

Use executable parity checks to find gaps. Use the parity matrix to record and
categorize them.

## Default Loop

1. Run the differential harness against `main`.
   - Default: `./scripts/run-backend-differential-parity.sh --baseline-ref main`
   - Iterate with `--only <scenario>`
   - Use `--manifest scripts/backend-differential-parity-corpus-scenarios.yaml`
     for latest-state corpus checks
2. Treat harness mismatches as the active work queue.
   - Fix the Go behavior, or explicitly classify it as an intentional
     divergence or retained Python boundary
3. Add or update focused tests for the specific behavior.
4. Re-run the relevant harness scenario(s) and targeted tests until they pass.
5. Update `backend-behavior-parity-matrix.md`.
   - Split coarse rows when a harness mismatch disproves a broad `Proved` row
   - Do not mark behavior `Proved` without executable or narrowly targeted
     proof

## How To Use The Matrix

- Use it as a searchable ledger of behavior ids, source evidence, Go ownership,
  and test coverage.
- Use existing `Missing` and `Implemented, proof incomplete` rows to choose the
  next harness slice.
- Do not use matrix status counts alone as evidence that major gaps are gone.

## Priority Order

1. User-visible current-caller mismatches found by the harness
2. Existing matrix rows already marked `Missing` or
   `Implemented, proof incomplete`
3. New harness scenarios for high-risk areas the matrix still covers mainly by
   inspection

## Current Starting Backlog

- Expand the differential manifest beyond the current bootstrap / websocket /
  create-defaults / dedicated-`/settings` shell / settings-live-hydration /
  reserved-name-save / required-view-mode-repair /
  deleted-active-tab-repair / missing-required-section /
  code-obj-backfill / display-name-backfill / workspace-launch
  outdated-settings slice
- The previously isolated dedicated-`/settings` persisted-layout gap is now
  closed; keep any newly uncovered non-caller-visible mismatches explicit
  instead of folding them back into broader live-contract rows
- The next queue should come from the remaining matrix `Missing` and
  `Implemented, proof incomplete` rows outside this now-proved `/settings`
  slice
- The latest-state stale-`activeIds`, empty-`windowSpaces`, and
  project/window-space load-normalization rows are now proved via the default
  harness; add more corpus/latest-state scenarios only when a new current-
  caller mismatch appears or an unproved row still lacks executable coverage
- The fail-closed missing-authoritative `projectChatWindowing`, section-bound
  title-clearing/dedupe, project-chat owner/mode validation, saved
  window-space owner/mode validation, and empty latest-state `windowSpaces`
  shape rows are now all proved via the default harness
- The multi-project windowing scoping, direct
  `setProjectChatWindowChatId`, and broader
  `setProjectChatWindowingState` invalid-owner rows are now proved via the
  default harness too, and the remaining saved-window-space write-validation
  row is now proved as well
- For that `createWindowSpace` write-validation slice, the harness now treats
  the source FastAPI validation envelope as a retained Python boundary and
  compares the caller-visible rejection detail text instead of Python's raw
  stringified validator internals
- The prompt-template-link non-prompt-section route row is now proved via the
  default harness too, including normalization of the source dynamic
  `Section <id> failed type guard` detail string; the next queue remains the
  broader remaining `Missing` and `Implemented, proof incomplete` rows
  outside the now-proved windowing, `/settings`, and prompt-link slices
- The local-dev auth middleware negative branch for an inactive
  dev-frontend-port contract is now proved by direct Go handler coverage too;
  keep using small targeted tests like this when a caller-visible row is
  already implemented and a full differential harness slice would add little
  beyond the isolated proof
- The no-profile config-loader branch that ignores `profileLookupHome` is now
  proved by direct Go `Load(...)` coverage too; continue taking these shared
  config/CLI proof-only rows in small slices while the larger remaining work
  stays on deployment, websocket, watch-code, external-agent, and packaged-CLI
  gaps
