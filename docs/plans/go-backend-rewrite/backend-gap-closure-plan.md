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
  required-view-mode-repair / deleted-active-tab-repair /
  missing-required-section / code-obj-backfill / workspace-launch
  outdated-settings slice
- Add executable proof for the remaining dedicated-`/settings` rows that are
  still open, especially:
  `settings_project.scaffold.sections_use_shared_settings_file_json_source_variants_by_slice`,
  `settings_project.validation.save_updates_allow_reserved_settings_name_beyond_bootstrap`,
  and
  `settings_project.code_objs.field_type_to_param_impl_mapping_preserved_on_create_and_backfill`
- Keep newly isolated non-caller-visible mismatches explicit instead of folding
  them back into broader live-contract rows; the next example is
  `settings_project.load.partial_layout_visible_section_repair_is_ephemeral_on_disk_in_source`
- More corpus-driven latest-state hydration / projection scenarios
