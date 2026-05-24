# GPU Flow Principled Projection Runtime Verification

Date: 2026-05-19
Area: frontend

## Context

The current branch head already contains the principled GPU Flow projection
runtime implementation. This report records post-request verification that the
implemented runtime still satisfies the plan's primary observable guardrails:
motion-first publication, coherent projection transaction ids, retained scroll
visual continuity, and no content work inside projection frames.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/GpuFlow/domControlPlaneProjectionRuntime.test.tsx src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/committedSurfaceFrame.test.ts src/gpuFlow/retainedCommittedCoverageStore.test.ts`
  passed (`41` tests).
- `pnpm -C frontend exec vitest run src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/committedSurfaceFrame.test.ts src/gpuFlow/GpuFlow/flowFrame.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/GpuFlow/flowSurface.test.tsx src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/GpuFlow/domControlPlaneProjectionRuntime.test.tsx src/gpuFlow/GpuFlow/flowRetainedPageMaintenance.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/retainedVisibleCoveragePlanner.test.ts src/gpuFlow/interactions/wheelOwnership.test.ts src/gpuFlow/interactions/retainedContentInteraction.test.ts src/gpuFlow/interactions/retainedContentScroll.test.ts`
  passed (`116` tests).
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts`
  passed (`2` tests).
- `./scripts/quality/check.sh` reported no supported changed files before this
  report was added.

## Result

The focused checks exercised the runtime boundary from both sides:

- mixed motion/content/maintenance reasons publish motion first and keep debt
  queued;
- projection-only frames reject uploads, retained display transactions, and
  other content work;
- held-previous transactions preserve the prior committed frame, projection
  sample, DOM transform batch, hit projection, activation mapping, and debug
  identity together;
- the runtime-owned DOM-control projection manager projects already-mounted
  hosts during viewport motion without rerunning React mount selection;
- the user-recording regression spec preserved All Settings RAF cadence and
  verified that viewport plus retained-scroll gestures did not perform content
  work on projection frames.

CDP visual check: not run for this verification-only report; no UI styling or
layout code changed in this pass, and the focused Playwright regression covered
the browser-observed retained-scroll behavior.
