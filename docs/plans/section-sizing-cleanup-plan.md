# Section sizing cleanup plan

## Goals
- Make section sizing rules deterministic and enforced in one place.
- Prevent invalid sizes from being persisted (negative, NaN, or below policy mins).
- Remove implicit sizing quirks by making them explicit and testable.
- Add tests that lock down sizing behavior for resizing and auto layout.

## Current issues
- Backend accepts any section size payload without validation/clamping.
- Auto layout throws when a section is `auto` and layout w/h are missing.
- Frontend has implicit behavior (e.g., min scaling for certain types) that is
  hard to spot and not covered by tests.

## Plan
1. Backend normalization + invariants
   - Add a single normalization function that clamps numeric sizes to policy
     min/max and rejects non-finite numbers.
   - Apply normalization in `create_section` (post-create) and
     `set_section_sizes` so both new and resized sections are consistent.
2. Auto layout fallback for auto sizes
   - When layout w/h are missing and section size is `auto`, fall back to
     policy mins instead of throwing.
   - Keep layout packing logic the same; only change dimension resolution.
3. Frontend cleanup for min-scaling quirks
   - Replace inline min-scaling logic with an explicit helper + constant so it
     is visible and testable.
   - Add unit tests for min-scaling behavior and min/max policies.
4. Tests
   - Backend: unit tests for size normalization (min/max clamp + auto passthrough)
     and for auto layout with `auto` sizes.
   - Frontend: Vitest coverage for min-scaling helper + policy min/max helpers.

## Verification
- Run backend pytest via `./scripts/run_backend_tests.sh`.
- Run frontend Vitest for the new sizing tests via
  `pnpm -C frontend exec vitest run <test path>`.

## Follow-ups (optional)
- Move size mode rules (manual-only / auto-only) into policy so backend can
  validate auto/manual constraints.
- Consolidate special-case sizing (Draw/YouTube/Twitter) into a dedicated
  sizing module with its own tests.
