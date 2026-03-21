# Backend Gap Closure Plan

Last updated: `2026-03-19`

Purpose: define the default workflow for future Codex sessions that are
closing remaining Go backend parity gaps.

## Status

This document is now a workflow/playbook, not an open manual backlog.

- The explicit current-caller gap queue described by the matrix is exhausted.
- Sessions should not treat the existence of this document, or matrix status
  counts alone, as evidence that parity work is finished.
- Completion for any session must come from executable checks plus any
  resulting fixes, classifications, tests, and matrix updates.

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

## Session Definition Of Done

Do not declare the plan "fully executed" for a session unless all of the
following are true:

1. `./scripts/run-backend-differential-parity.sh --baseline-ref main` has been
   run for the current branch state.
2. Every mismatch found in that run has been fixed or explicitly classified as
   an intentional divergence or retained Python boundary.
3. Focused tests and matrix updates for that session's work are complete.
4. `./scripts/run-backend-differential-parity.sh --baseline-ref main --manifest scripts/backend-differential-parity-corpus-scenarios.yaml`
   has been run too, or a concrete blocker has been recorded if that latest-
   state corpus path is currently broken for reasons outside the active Go
   parity work.
5. The session report includes the exact parity commands run and whether they
   passed, mismatched, or were blocked.

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

## Current State

- The default differential manifest now includes
  `json_source_watcher_live_reload` and matches `main`, including the live
  websocket project-state update after a watched backing `.json` file changes
  on disk.
- The latest-state corpus manifest is runnable again against `main`: fixture
  seeding now normalizes Go-shaped persisted project documents into the Python
  source-store shape when the baseline target still boots the Python backend,
  so latest-state corpus scenarios reach comparison instead of failing during
  startup.
- The latest-state corpus manifest now proves both the empty shown-param-ids
  branch and a non-empty `addKwarg` refresh branch, where the next
  latest-state read keeps the pinned/unpinned split and projects the created
  param into the unpinned `shownParamIds` payload.
- The explicit current-caller gap queue is now exhausted:
  `backend-behavior-parity-matrix.md` is at `Missing = 0` and
  `Implemented, proof incomplete = 0`.
- Future sessions should start from executable discovery again:
  run the default differential manifest first, fix any new mismatch, or
  classify it explicitly as an intentional divergence or retained Python
  boundary before touching the matrix.
- The next expansion work is not “close the old backlog”; it is “add new
  harness slices for still-risky surfaces that are mostly covered by source
  inspection, retained Python boundaries, or dormant callers”.
- Treat the old JSON-source autosave-deferral helper as a retained Python
  boundary unless a real live caller disproves that classification. Source
  inspection suggests `watch_json_source_files()` passes only newly watched ids
  into `_should_defer_json_source_reload`, while that helper's `True` branch
  requires previously watched ids, and the Go rewrite has no backend autosave
  supervisor at all.
- Keep updating `backend-behavior-parity-matrix.md` after every executable
  proof, explicit divergence, or boundary reclassification. Split broad rows
  when a new harness mismatch disproves a coarse `Proved` entry.

## Current Known Blockers

- No default-manifest or latest-state corpus-manifest harness blockers are
  currently recorded. Future sessions still need to rerun both required parity
  commands for the current branch state before treating them as green.

## Next Expansion Backlog

- Add new executable harness slices for still-risky surfaces that are mostly
  covered today by source inspection, retained Python boundaries, or dormant
  callers.
- Expand the latest-state corpus beyond the existing shown-param-ids slices so
  more retained-boundary-adjacent surfaces move from inspection to executable
  proof.
- Prioritize new slices by current caller risk, not by matrix row counts.
- Revisit retained-boundary classifications only when a real live caller
  disproves the current scope decision.
