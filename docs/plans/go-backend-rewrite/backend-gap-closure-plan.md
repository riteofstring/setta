# Backend Gap Closure Plan

Last updated: `2026-03-19`

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

- The default differential manifest now includes
  `json_source_watcher_live_reload` and matches `main`, including the live
  websocket project-state update after a watched backing `.json` file changes
  on disk.
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
