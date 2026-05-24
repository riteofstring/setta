# GPU Flow Visible Frame Baseline - 2026-05-23

## Context

- Plan: `docs/plans/gpu-flow-coherent-visible-frame-engine-plan.md`
- Current commit under test: `d218256f0`
- Latest Chrome recording inspected: `recording-20260523-104209`
- Recording path: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260523-104209`

The current branch already contains the retained Settings visible-frame and
scroll-continuity E2E coverage named by the plan. This run records the current
post-slice baseline after adding the proof-owned blocked/held outcome fix and
the standalone visible-frame reducer foundation.

## Commands

```sh
pnpm -C frontend exec vitest run \
  src/gpuFlow/GpuFlow/visibleFrameEngine.test.ts \
  src/gpuFlow/GpuFlow/flowCommittedSurfacePublication.test.ts \
  src/gpuFlow/GpuFlow/flowSurfacePublicationCompletion.test.ts
```

Result: passed, 3 files / 21 tests.

```sh
pnpm -C frontend exec tsc --noEmit --pretty false \
  --target ES2022 \
  --module ESNext \
  --moduleResolution Bundler \
  --lib ES2022,DOM \
  --types vitest \
  src/gpuFlow/GpuFlow/visibleFrameTypes.ts \
  src/gpuFlow/GpuFlow/visibleFrameEngine.ts \
  src/gpuFlow/GpuFlow/visibleFrameEngine.test.ts
```

Result: passed.

```sh
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/settings/settings-retained-visible-frame-coherence.spec.ts \
  frontend/tests/e2e/settings/settings-retained-compositor-scroll-continuity.spec.ts
```

Result: passed, 6 tests in 30.3s.

Generated Playwright evidence under `frontend/test-results/` included:

- `visible-progress-before.png`
- `visible-progress-around-60ms.png`
- `visible-progress-around-120ms.png`
- `visible-progress-final.png`
- `blocked-visible-snapshot-before.png`
- `blocked-visible-snapshot-after.png`
- `blocked-visible-live-host-before.png`
- `blocked-visible-live-host-after.png`
- `blocked-visible-cold-start-shell.png`
- retained compositor moderate and fast motion sample sequences.

## Observations

- The named page-error class from the recording is no longer thrown by the
  committed-surface effect executor when blocked or held outcomes are owned by
  non-committed-surface proofs.
- The Settings retained scroll continuity specs observed intermediate motion,
  nonblank retained content, frame-cadence bounds, and no direct jump to the
  final retained-section state.
- The Settings visible-frame coherence specs observed blocked browser visual
  withholding, cold-start shell behavior, preserved coherent frames, nonblank
  screenshots, and retained scheduler debt.
- Full `pnpm -C frontend typecheck` was attempted but is not a useful gate for
  this slice because it currently fails on unrelated existing errors across the
  broader frontend tree. The touched reducer files passed a targeted compiler
  check.

## Remaining Plan Work

- Wire the new `visibleFrameEngine.ts` reducer into production presentation
  selection.
- Move visible mutation batching into `visibleFramePresenter.ts` and make it
  the only production presentation authority.
- Convert actor families into pure candidate preparers and resource proof
  participants.
- Delete the old independent publication authority/oracle/completion modules
  after the engine owns production presentation.
- Run the full retained GPU Flow benchmark subset, full frontend touched tests,
  `./scripts/quality/check.sh`, and a fresh Chrome recording before declaring
  the plan complete.
