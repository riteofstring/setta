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
- The latest-state stale-`activeIds` load-normalization row is now proved via
  the default harness; the next likely latest-state queue is the remaining
  project/window-space load-normalization rows
- The fail-closed missing-authoritative `projectChatWindowing`, section-bound
  title-clearing/dedupe, project-chat owner/mode validation, saved
  window-space owner/mode validation, and empty latest-state `windowSpaces`
  shape rows are now all proved via the default harness
- The multi-project windowing scoping row is now proved via the default
  harness too; after the duplicate-`sortIndex` load-normalization gap, the
  next queue is the remaining proof-incomplete write-validation rows
- More corpus-driven latest-state hydration / projection scenarios
