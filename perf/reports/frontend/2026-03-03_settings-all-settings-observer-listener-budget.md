# Settings All Settings Observer/Listener Budget

Date: 2026-03-03
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ 663f7b176 (with local experiment changes during measurement)
Experimented code paths (reverted):
- `frontend/src/state/hooks/sectionSizes.ts` (`useIsScrollable`)

Implementation status: **Not kept** (experiment reverted; report retained for decision history).

## Goal

Reduce non-pan interaction cost by lowering per-section observer/listener callback pressure in `All Settings`, while preserving UX behavior.

## Change Summary (Experiment)

Variant 1:
- In `useIsScrollable`, coalesced observer-triggered work to one `requestAnimationFrame` pass.
- Narrowed mutation observation from `{ childList, subtree, attributes, characterData }` to `{ childList, subtree }`.
- Added capture listeners for `input`/`change` to keep overflow checks responsive for typed content.

Variant 2:
- Same as Variant 1, but removed the added `input`/`change` listeners after seeing listener fanout growth.

## Measurement Setup

- Playwright baseline harness:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- CDP scripted interaction:
  - `/settings` -> `All Settings`
  - scripted pan/zoom throughput and section `Filter` typing timing.
- CDP observer/listener budget sampling:
  - pre-navigation init script patched `ResizeObserver`, `MutationObserver`, and `addEventListener` for construction/option counts.

## Observer/Listener Structural Results (CDP)

Baseline (before patch):
- `ResizeObserver.constructed = 675`
- `MutationObserver.constructed = 253`
- Mutation option signatures:
  - `{ attributes:false, childList:true, subtree:true, characterData:false }`: `166`
  - `{ attributes:true, childList:true, subtree:true, characterData:true }`: `93`

Variant 1 (with `input`/`change` listeners):
- `ResizeObserver.constructed = 675` (unchanged)
- `MutationObserver.constructed = 252` (effectively unchanged)
- Mutation option signatures:
  - `{ attributes:false, childList:true, subtree:true, characterData:false }`: `250`
  - `{ attributes:true, childList:true, subtree:true, characterData:true }`: `9`
- Listener attachment shifts (top types):
  - `input`: `170` (from `86`)
  - `change`: `172` (from `88`)

Interpretation:
- The patch successfully removed most broad attribute/character-data mutation observation.
- It did not reduce observer instance count and, in Variant 1, materially increased input/change listener fanout.

## Playwright Harness Results

Reference baseline report:
- `perf/reports/frontend/2026-03-02_settings-all-settings-performance-baseline.md`
- Baseline typing metric: `typing.avgFrameMs = 164.91`

Variant 1 runs:
- Run A: `161.20`
- Run B: `187.76`
- Run C: `186.48`
- Median: `186.48`

Variant 2 run (removed input/change listeners):
- Run D: `198.19`

Control reruns after reverting experiment:
- Run E: `183.97`
- Run F: `182.40`
- Median: `183.19`

Other metrics (pan/zoom/start/stop hitch) stayed in prior ranges and did not show a clear positive shift.

## CDP Scripted Samples (Supplementary)

- Control sample before patch: typing avg `226.21ms`
- Variant 1 sample: typing avg `198.50ms`
- Control sample after revert: typing avg `212.33ms`

Interpretation:
- CDP scripted samples moved in both directions and were too noisy to override Playwright trend.

## Conclusion

- This observer/listener budget pass was **not kept**.
- The structural observer-option cleanup did not translate into a reliable end-to-end win in the current benchmark.
- Playwright median typing cost remained worse than the established baseline and did not beat same-day control reruns.

Decision:
- Revert experiment code.
- Keep this report as decision history.
- Continue with alternative non-pan candidates that can reduce work without increasing callback fanout or state churn.

## Verification

- `pnpm -C frontend exec vitest run src/state/hooks/sectionSizes.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- Multiple Playwright baseline harness reruns (values above).
- CDP observer/listener instrumentation and scripted samples captured during experiment.
