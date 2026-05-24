# GPU Flow Principled Projection Runtime - After

Date: 2026-05-18
Area: frontend

## Goal

Replace reason-coalesced visible publication with a projection runtime boundary:
motion publishes through one immutable live sample, content and maintenance stay
as queued debt, and canvas plus DOM-control projection publish under the same
transaction identity.

## Baseline

The source plan captured the pre-change failure from the latest Chrome
recording:

- projection-only frames were fast (`~0.33 ms` viewport-only and `~0.90 ms`
  retained-scroll-only);
- mixed `retained-scroll + paint + texture-upload` requests fell back to full
  content publication because the old projection predicate required all reasons
  to be motion-like;
- All Settings retained-scroll content frames exceeded the `8.5 ms` budget, with
  visible frame gaps in the `40-75 ms` range;
- DOM controls could lag or disappear because mount selection was tied to
  committed React/content frames while canvas projection advanced independently.

## After

Implemented guardrails and browser checks now cover the projected runtime
boundary:

| Scenario                          | Result                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mixed dirty-reason motion lane    | Unit coverage verifies `retained-scroll + paint + texture-upload` publishes motion first and queues content/maintenance debt.                                                |
| Projection transaction identity   | Unit and Playwright coverage verify canvas and DOM-control plane expose matching committed frame id, projection sample id, and transaction id.                               |
| DOM-control projection assignment | Unit coverage verifies active controls stay pinned outside the passive horizon and all assignments expose explicit coverage states.                                          |
| Retained horizon contract         | Unit coverage verifies retained scroll horizons emit visible, active-pinned, near-future, and maintenance obligations.                                                       |
| Retained scroll performance       | Focused Playwright retained-scroll guardrail passed with no long-task or visual-continuity budget failure.                                                                   |
| Live visual/runtime check         | CDP loaded `/settings` with GPU Flow enabled. Canvas and DOM-control plane covered the same `1512x644` viewport and both published `content-publication:content-7:sample-6`. |

Focused verification:

- `pnpm -C frontend exec vitest run src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/committedSurfaceFrame.test.ts src/gpuFlow/GpuFlow/retainedDomControlSources.test.ts`
  passed (`27` tests).
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-committed-surface-actor-regressions.spec.ts`
  passed (`2` tests).
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`
  passed (`1` test).
- `./scripts/quality/check.sh` passed.
- CDP visual check on `/settings` passed: no application error, Settings content
  visible, GPU Flow canvas present, DOM-control plane present, and transaction
  debug attributes matched across both surfaces.

## Diagnostics

The runtime now exposes projection transaction diagnostics on the visible
surfaces:

- committed content frame id;
- projection sample id;
- projection transaction id;
- transaction kind through the transaction prefix (`motion-projection`,
  `content-publication`, or `held-previous`);
- publication lane through `data-gpu-flow-projection-lane`.

The visible scheduler also records raw frame reasons separately from the chosen
publication lane, so mixed dirty work remains debuggable without letting passive
work own the visible frame.
