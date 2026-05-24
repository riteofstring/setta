# GPU Flow Retained Content Lifecycle Baseline

Date: 2026-05-15

## Command

```sh
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-zoom-click-visual-continuity.spec.ts
```

Result: failed before compositor behavior changes, as required by the
failing-first gate.

## Observed Failure

The new retained visual continuity guardrail reproduced the user-visible
horizontal placeholder-band artifact during retained Settings zoom.

Representative crop metrics:

- `settings-section__shortcuts:param-content:unpinned`: 8 bands, dominant band
  coverage `0.9819`, dominant band height `3px`, regular spacing ratio `1`.
- `settings-section__gui:param-content:unpinned`: 8 bands, dominant band
  coverage `0.9638`, dominant band height `3px`, regular spacing ratio `1`.
- `settings-section__chatWindowing:param-content:unpinned`: 7 bands, dominant
  band coverage `0.9819`, dominant band height `3px`, regular spacing ratio
  `1`.
- `settings-section__sectionSizingPolicy:param-content:unpinned`: 8 bands,
  dominant band coverage `0.9638`, dominant band height `3px`, regular spacing
  ratio `1`.

All sampled crops were nonblank, so the failure is not blank content. It is
the repeated wide light-band pending treatment over retained section bodies.

## Environment Notes

- Playwright launched Chrome for Testing Canary `150.0.7835.0`.
- The E2E harness used a disposable workspace and default 1200 x 672 viewport.
- The run stopped after the first failing test because Playwright max-failure
  handling halted the file; the click guardrail was not reached in this
  baseline run.
