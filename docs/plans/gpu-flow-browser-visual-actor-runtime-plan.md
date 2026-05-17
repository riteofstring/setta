# GPU Flow Browser Visual Actor Runtime Plan

Date: 2026-05-19
Status: Planned

## Goal

Unify all browser-owned visible actors under the same publication model as
retained pages. Browser-owned actors include DOM controls, DOM islands, and any
other viewport-positioned browser representation that supplies pixels or native
semantics WebGPU should not own directly.

Replace the current DOM-control projection path with a Browser Visual Actor
Runtime. The runtime must make browser-owned pixels, canvas retained pixels,
hit projection, activation mapping, and debug evidence publish as one coherent
visible frame.

This is a larger refactor. The point is not to patch the Chrome recording bug
by special-casing one flag or one control type. The point is to remove the
class of bugs where the retained compositor reports coverage from desired
descriptors while the actual browser-owned layer is blank, stale, or projected
from a different frame.

Done means:

- Chrome recordings and normal browser sessions render the same visible content.
- Recording instrumentation never changes rendering or mounting policy.
- Visible nonempty browser-owned actors are readable before click, during
  retained section scroll, during viewport pan/zoom, after settling, and inside
  Chrome repro recordings.
- Frame cadence stays within the retained Settings budget while visible
  browser-owned values remain nonblank.
- A committed frame cannot report complete browser-owned actor coverage unless
  the actual published representation is live, exact snapshot, or mechanically
  compatible previous coverage.
- React semantic deduplication cannot leave browser visual layers behind the
  canvas committed content frame.

## Architectural Thesis

The target architecture is WebGPU-first composition with browser-owned semantic
actors governed by one transaction and coverage model. Browser DOM is a
representation provider and semantic owner for specific actors. It is not the
project graph renderer.

`BrowserVisualActor` is the shared publication concept for DOM controls and DOM
islands. Actor types may use different renderers and activation rules, but
publication must not be split by actor kind. Each browser visual actor has:

- canonical actor identity and generation;
- required representation kind;
- committed flow-space geometry;
- clip-chain membership;
- readiness state;
- actual representation coverage proof;
- projection transform;
- hit and activation mapping;
- transaction membership.

Hard invariants:

- A visible frame is publishable only if every visible nonempty browser-owned
  actor has actual live, exact snapshot, or compatible-previous representation
  coverage, or the frame explicitly holds previous coherent coverage.
- React may construct and update hosts, but React is not the authority for
  visual publication.
- Motion frames may transform existing ready representations only. Motion must
  not create hosts, measure hosts, capture snapshots, or pretend missing
  coverage exists.
- Browser-rendered snapshots are first-class representations, not fallback
  hacks.
- Descriptor counts are diagnostics. They never prove visible browser-owned
  pixels exist.

## Relationship To `surfaceCompositor/`

`BrowserVisualActor` is not a parallel compositor model. It is the
browser-owned actor family that produces `SurfaceActor`, `SurfaceGeneration`,
and `SurfaceCoverageProof` inputs for the existing `SurfaceDisplayTransaction`
and `GpuFlowCommittedSurfaceFrame` publication path.

The implementation should reuse the existing surface compositor vocabulary for
actor identity, generation identity, exact coverage, compatible coverage,
blocking coverage, true holes, protected resources, z-order, hit membership,
held previous transactions, and cold-start behavior. If browser-owned actors
need more proof detail, extend the shared surface compositor contract rather
than creating a second browser-only coverage proof that must be reconciled
later.

Browser visual coverage states must be consumed by the same transaction
machinery as retained pages, HTML texture actors, native visuals, hit maps,
activation mapping, and debug snapshots.

## Representation Vs Projection

Browser representation readiness and browser projection readiness are separate
facts.

Representation coverage proves that a live host, exact snapshot, or compatible
previous representation exists for the actor's visible content. Its key
includes actor id, visual generation, semantic generation when relevant,
value/content revision, geometry slot, style revision, DPR, zoom bucket,
clip-chain, representation kind, resource handle, and invalidation reason.
Style revision includes font loading state, theme tokens, CSS custom
properties, text rendering mode, browser zoom bucket, selection/caret
visibility when relevant, and CodeMirror measurement-affecting state.

Projection coverage proves that a ready representation has been transformed,
clipped, stacked, hit-mapped, activated, and joined to the current live
projection sample and transaction id. Its key includes live projection sample
id, transform, viewport, retained-scroll offset, CSS-pixel clip rect, z-order,
hit/activation mapping, and transaction id.

A snapshot should normally survive pan, retained section scroll, and viewport
projection changes without recapture. Motion frames may update projection
readiness only; they must not create representation readiness.

## Atomic Visible Publish Sequence

Publishing is a staged visible commit, not independent layer mutation. The
browser engine may paint DOM and canvas on its own cadence, but Setta must not
expose an intentional intermediate state where canvas, browser actors, hit
maps, activation maps, or debug evidence refer to different transactions.

The deterministic publish sequence is:

1. Resolve the desired `SurfaceDisplayTransaction`.
2. Query browser actor representation coverage for the desired transaction.
3. Classify each required browser representation as exact, compatible,
   blocked, or true-hole.
4. If the transaction is publishable, protect all resources and assign the
   transaction id.
5. Stage browser actor parking and projection for that transaction.
6. Stage canvas/compositor draw commands for that transaction.
7. Stage hit map, activation map, and debug snapshot for that transaction.
8. Mark the transaction visible only after all staged outputs are ready for the
   same transaction id.

If any stage cannot produce coherent outputs for the transaction, the runtime
holds previous coherent coverage, blocks cold first coverage, or publishes a
typed cold placeholder only when the actor contract explicitly allows it.

## Visible Nonempty Actor Contract

Coverage obligation is explicit. A browser actor cannot avoid coverage by being
misclassified as empty, clipped, or non-visible.

Each browser visual actor declares:

- `visibilityReason`: `visible`, `clipped-empty`, `outside-viewport`,
  `hidden-by-policy`, or `blocked`.
- `nonemptyReason`: `value-text`, `placeholder-text`, `selection-caret`,
  `active-editor`, `native-control-affordance`, or
  `semantic-required-visible`.
- `coverageRequired`: boolean plus a typed reason.
- `coverageExemption`: only for explicit cases such as outside viewport,
  clipped empty, or a policy-hidden actor that is not hit-testable.

Empty text is not automatically coverage-exempt. Empty-but-focused editors,
placeholders, password fields, native control affordances, active composition,
visible caret/selection, and semantic-required-visible actors still require
browser-owned coverage.

## Compatible Previous Proof

`compatible-previous-ready` is allowed only with a strict mechanical proof. It
must not become another way to publish desired coverage without user-visible
pixels.

The proof must establish:

- same canonical actor id;
- unchanged visible value/content generation, or an explicitly compatible
  generation transition;
- unchanged style revision and DPR/zoom bucket;
- geometry change representable by transform without browser reflow;
- clip-chain compatibility;
- unchanged activation class;
- unchanged focus, selection, caret, and composition requirements;
- bounded age and frame count;
- same transaction lineage for hit and activation mapping.

If any item is unknown, the actor is blocked or a true hole. It is not
compatible previous coverage.

## Current Failure

The latest user Chrome recording showed a hard split between logical coverage
and actual browser-visible coverage:

- Retained display diagnostics reported `361` DOM-control sources, `361`
  projected controls, and `303` visible nonempty controls.
- The real DOM-control projection measure reported `hostCount=0` for almost
  the whole recording, then only `hostCount=2`.
- The canvas/content side continued publishing newer committed frames while
  the DOM-control plane remained on an older committed/runtime frame.
- The screenshot showed retained row chrome and labels, but most values and
  input fields were empty.

The immediate regression was introduced when Chrome repro mode was wired into
`GpuFlowDomControlPlane` through
`frontend/src/gpuFlow/GpuFlow/domControlPlaneProgressiveMount.ts`. The recorder
extension sets `window.__SETTA_CHROME_REPRO_ACTIVE__ = true`; the app then
interprets that instrumentation flag as a rendering policy and aggressively
defers passive DOM-control mounting.

That branch was trying to avoid long tasks from mounting many browser text
hosts. The performance concern is valid. The boundary is wrong: a recording
flag cannot change visible publication behavior, and descriptor-level
projection cannot count as user-visible coverage.

## Non-Goals

- Do not reintroduce a DOM-rendered Settings page.
- Do not move editable/selectable text pixels back into canvas-only drawing.
- Do not keep transitional dual render paths.
- Do not keep recorder-specific rendering branches.
- Do not add backward compatibility shims, legacy aliases, or compatibility
  fallbacks.
- Do not let the Browser Visual Actor Runtime own parameter values, actor
  identity, section layout, row geometry, activation policy, or persistence.
- Do not treat debug descriptor counts as proof of visible coverage.
- Do not relax motion-frame performance guardrails to hide browser host work.

## Borrowed Ideas

Use the example repos as design pressure, not as libraries to copy wholesale.

### WICG HTML-In-Canvas

The official explainer is explicit about three separate facts:

- `layoutsubtree` children remain browser-laid-out direct canvas children.
- A draw/upload snapshot has readiness semantics; calls outside the valid paint
  snapshot use previous data or fail.
- The DOM location must be synchronized to the drawn location so native hit
  testing, focus, accessibility, caret, and selection stay correct.

Setta should mirror that separation. A browser actor has source data,
representation readiness, and projected DOM location. Only a ready
representation can satisfy visible coverage.

### three-html-render

`InteractionManagerStandalone` keeps overlay projection as matrix math driven
by the current camera/view matrices. `RaycastInteractionManager` parks stale
elements offscreen when they are not under the active projection and keeps
native DOM semantics for clicks, focus, selection, and hover.

Setta should borrow the principle:

- one runtime-owned projector applies transforms from the latest projection
  sample;
- stale or unassigned hosts are parked, not left visually active;
- motion projection is transform work only, not React host selection;
- pointer ownership is explicit so controls and pan/zoom do not fight during a
  wheel or pointer burst.

### html-in-canvas-cracks

The useful lessons are:

- keep the visible stage fixed to the viewport instead of compensating scroll
  with main-thread transforms;
- store visual geometry in CSS pixels and let texture/source content reflow
  through that geometry;
- do not reveal a pipeline stage until the first valid frame exists;
- expose debug views that show raw HTML, source texture, and composite output
  side by side.

For Setta, that means browser actor slots stay CSS-pixel geometry owned by the
committed scene, while the representation projected into those slots can
advance independently only when its coverage proof is valid.

### compiz-web

The transition engine keeps old and new page textures explicit during a
transition and only finishes after the new state has been drawn. That is the
right mental model for Setta's visible frame publication: previous coherent
coverage and next prepared coverage are separate states. A partially prepared
new state must not replace readable previous content.

### html-in-canvas.dev

The demo site's tests use browser-observed smoke checks: API availability,
nonblank canvas pixels, no console errors, and interaction after first paint.
Setta needs the same style of guardrail, extended for retained Settings:
nonblank value/control pixels, frame cadence, native interaction, and identical
behavior in normal and Chrome recording contexts.

## Workstream 1: Add Failing Observed-Behavior Tests First

Before changing runtime code, add tests that fail on the current branch and
capture the exact observed regression. These tests must assert user-visible
behavior and performance, not internal implementation details.

Implementation targets:

- Add a Playwright Settings E2E that runs the retained Settings flow with:
  - normal browser mode;
  - Chrome recorder-equivalent mode via an init script that sets
    `window.__SETTA_CHROME_REPRO_ACTIVE__ = true`.
- In both modes, open All Settings, center or reveal sections with many
  text-like values, and wait for retained rows to be visible.
- Capture value/control clips for visible nonempty text-like rows and assert
  real ink pixels are present before any click.
- Drive retained section scroll and viewport pan/zoom while sampling:
  - visible value/control clips;
  - RAF cadence;
  - long tasks;
  - console/page errors.
- Assert values remain nonblank during motion and after settle.
- Click a visible text-like value and type a short marker. Assert native focus
  lands on the visible control, typed text appears in the same screen rect, and
  the rect stays aligned after a small pan/zoom.
- Add an IME/composition path where an active composing editor remains live
  and aligned through retained scroll and viewport pan/zoom.
- Add a selection/caret path where native selection and caret position survive
  projection frames.
- Add a passive-to-active handoff path: click a passive browser actor, activate
  the native editor, type, pan/zoom, and assert one actor identity, one
  transaction, aligned pixels, and correct hit mapping.
- Add a z-order/clipping path covering overlapping DOM controls, DOM islands,
  retained popups, and browser actors.
- Add a snapshot eviction path that forces snapshot recreation under budget and
  verifies descriptor-only coverage does not pass.
- Add a starvation path that exhausts live-host budget and delays snapshots;
  assert blocked coverage holds previous or fails loudly rather than publishing
  blanks.
- Add a Chrome recording analyzer gate that fails if visual evidence contains
  blank value clips, even when frame counters and debug descriptor counts pass.
- Make the analyzer fail if recording mode changes visible behavior compared
  with the normal-mode Playwright sample.

Acceptance criteria:

- The new tests fail on the current branch for the recorder-mode blank-values
  bug.
- The failure report includes screenshots or pixel summaries for the blank
  value/control clips.
- The test output reports frame cadence and long-task data for the failing
  interaction window.
- The tests do not assert `hostCount`, source descriptor counts, committed
  frame ids, or other implementation-specific fields as their primary oracle.

## Workstream 2: Define The BrowserVisualActor Publication Contract

Before changing runtime behavior, define the shared publication contract for
all browser-owned visible actors. DOM controls and DOM islands may have
different renderers and activation semantics, but they must answer the same
publication questions:

- For actor `X` and representation generation `Y`, what ready browser-owned
  representation exists?
- For ready representation `R`, clip chain `C`, projection sample `S`, and
  transaction `T`, what actual browser-owned pixels will the user see and hit?

Implementation targets:

- Define the `BrowserVisualActor` shape around identity, generation, actor
  kind, required representation, committed geometry, clip-chain key,
  nonempty-visible contract, activation class, and transaction membership.
- Implement `BrowserVisualActor` as an adapter into `SurfaceActor`,
  `SurfaceGeneration`, and `SurfaceCoverageProof`, not as a separate
  compositor layer.
- Define the representation and projection coverage APIs consumed by
  `GpuFlowCommittedSurfaceFrame` publishability through the existing surface
  transaction path.
- Represent actual coverage with typed states:
  - `live-host-ready`: a mounted browser DOM host is ready and projected;
  - `exact-snapshot-ready`: a browser-rendered snapshot exactly matches the
    actor representation coverage key;
  - `compatible-previous-ready`: previous visible representation has a
    mechanical compatibility proof for the current actor;
  - `blocked-awaiting-live-host`: visible coverage requires a host that is not
    ready;
  - `blocked-awaiting-snapshot`: snapshot coverage is allowed but not ready;
  - `true-hole`: no allowed representation exists.
- Make snapshot readiness first-class. Snapshot coverage must be keyed by actor
  generation, value/content revision, geometry slot, style revision, DPR/zoom
  bucket, clip-chain, representation kind, resource handle, and invalidation
  reason. If a representation key does not match, coverage is blocked unless a
  compatible-previous proof applies.
- Treat style revision as a browser-rendering key, not only an app theme key.
  It includes font loading state, theme tokens, CSS custom properties, text
  rendering mode, browser zoom bucket, selection/caret visibility when
  relevant, and CodeMirror measurement-affecting state.
- Define `visibilityReason`, `nonemptyReason`, `coverageRequired`, and
  `coverageExemption` for every browser visual actor before computing
  coverage.
- Keep descriptor/source counts as diagnostics only.

Acceptance criteria:

- DOM controls and DOM islands use one browser-owned publication contract.
- Browser-owned actor coverage produces shared surface compositor inputs, not
  a parallel browser-only coverage proof.
- A committed frame can ask for actual browser representation coverage by actor
  id, generation, clip key, projection sample, and transaction id.
- A descriptor is never counted as visibly projected merely because it exists
  or is desired.
- Empty, focused, composing, placeholder, password, and native-affordance actors
  cannot be coverage-exempt unless their actor contract provides a typed
  exemption.
- Snapshot coverage is evaluated with the same authority as live-host coverage,
  not as an ad hoc fallback.

## Workstream 3: Delete Recorder-Specific Rendering Policy

Recording mode is instrumentation. It must not choose a different renderer,
host budget, mount delay, representation type, or coverage policy.

Implementation targets:

- Remove app-rendering dependencies on `window.__SETTA_CHROME_REPRO_ACTIVE__`.
- Keep the recorder flag only for logging, artifact collection, and optional
  verbose diagnostics.
- Delete the Chrome-repro-specific DOM-control mount delay and one-host batch
  policy.
- Replace any finish-line report that treats debug descriptor coverage as
  visual evidence with pixel or browser-DOM observations.

Acceptance criteria:

- Normal mode and Chrome recorder mode use identical visible publication and
  browser-owned actor coverage policy.
- The recording extension can be enabled without changing host assignment,
  screenshots, frame ownership, or visible values, except for the additional
  diagnostics it records.

## Workstream 4: Introduce Browser Visual Actor Runtime

Create a runtime owner for browser-visible representations of
`BrowserVisualActor` instances. This runtime replaces React-frame-owned
DOM-control and DOM-island mount selection.

The runtime owns:

- a bounded live-host pool;
- active/focused/composing pins;
- prepared host assignments;
- browser-rendered snapshot assignments;
- compatible-previous representation records;
- projection transforms and clipping;
- offscreen parking for unused hosts;
- actual coverage state for each actor.

The runtime does not own:

- parameter values;
- actor identity;
- section layout;
- row geometry;
- activation policy;
- persistence.

Those remain owned by the project scene, retained descriptors, and committed
surface frame.

Active text handoff rule:

- A text-like parameter has one canonical browser actor identity.
- Its representation kind may transition between passive display, snapshot
  display, active editor, and parked/held states under one transaction.
- The runtime must not publish passive display pixels from one actor while hit
  mapping, focus, selection, or typed input belong to another actor.
- Activation replaces the actor's representation state; it does not create a
  second visible actor for the same row/value.

The implementation should make that rule type-level. Passive display, passive
snapshot, active editor, compatible previous, and blocked are representation
variants for one actor id, not independent visible actors:

```ts
type BrowserTextActorRepresentation =
  | { kind: "passive-live-display"; actorId: BrowserActorId; hostId: HostId }
  | { kind: "passive-snapshot"; actorId: BrowserActorId; snapshotId: SnapshotId }
  | {
      kind: "active-editor";
      actorId: BrowserActorId;
      islandId: DomIslandId;
      hostId: HostId;
    }
  | {
      kind: "compatible-previous";
      actorId: BrowserActorId;
      previousTransactionId: TransactionId;
    }
  | {
      kind: "blocked";
      actorId: BrowserActorId;
      reason: BrowserActorBlockedReason;
    };
```

Acceptance criteria:

- The committed frame can ask the runtime for actual coverage by actor id,
  generation, clip key, and projection sample.
- Motion projection can transform existing live/snapshot/compatible
  representations without creating or mounting them.
- Passive-to-active text transitions preserve one actor identity, one
  transaction, aligned pixels, and correct hit mapping.

## Workstream 5: Make Publication Use Actual Browser Actor Coverage

Update committed surface publication so browser-owned actors are part of the
same publishability decision as retained pages, hit projection, native visuals,
and debug snapshots.

Implementation targets:

- Add browser representation coverage proofs to `GpuFlowCommittedSurfaceFrame`
  actor generations and transaction membership.
- Map browser-owned exact, compatible, blocked, and true-hole states into
  shared `SurfaceCoverageProof` entries.
- Extend `surfaceCompositor/` only where the shared transaction contract lacks
  a needed browser-owned proof field; do not add a separate browser-only
  reconciliation layer.
- Compute display completeness from actual representation states, not desired
  descriptor projection.
- If a visible nonempty browser-owned actor is blocked and a previous coherent
  frame exists, hold previous.
- If no previous coherent frame exists, publish a diagnosed noninteractive cold
  placeholder only for explicit cold-start actor contracts. Text-like Settings
  values should not use this path during a warm visible frame.
- Publish canvas draw commands, browser representation transforms, hit maps,
  activation mapping, and debug snapshots under one transaction id.
- Expose failure diagnostics that distinguish desired actors from published
  representations.

Acceptance criteria:

- A frame with visible nonempty browser-owned actors and no
  live/snapshot/compatible representation is not publishable.
- Debug snapshots cannot report complete browser-owned actor coverage when
  value screenshots are blank.
- A click resolves through the same visible transaction that drew the target.

## Workstream 6: Read The Current Runtime Frame Outside React Semantic Dedup

React semantic snapshots may be deduped for render performance. Browser visual
projection cannot lag behind the current committed content frame because React
did not re-render.

Implementation targets:

- Keep the current committed content frame in a runtime store that supports
  non-React subscribers.
- Have the browser visual representation runtime subscribe to committed
  content frame changes directly.
- Use React only to render stable host shells and descriptor-backed content
  when host assignment changes, not as the authority for every visible
  projection sample.
- Ensure viewport and retained-scroll projection applies transforms from the
  latest live projection sample even when no React semantic render occurs.

Acceptance criteria:

- Canvas and browser visual layers cannot publish different committed content
  frame ids.
- A deduped React semantic update does not prevent newly committed browser
  actor coverage from being prepared, held, or projected.

## Workstream 7: Budget Host And Snapshot Preparation Without Hiding Holes

The performance concern that triggered the bad recorder branch is real:
browser text hosts are expensive. The replacement must keep host work bounded
without reporting missing values as covered.

Implementation targets:

- Maintain a fixed live-host budget with deterministic priority:
  1. composing or IME-active;
  2. focused active editor;
  3. selected or recently edited;
  4. visible interactable;
  5. visible passive readable;
  6. near-future passive;
  7. maintenance/prewarm.
- Prepare browser-rendered snapshots for excess passive readable controls when
  live hosts are unavailable and snapshot coverage is allowed.
- Maintain a snapshot memory budget with deterministic eviction. Snapshot
  resources should be protected while they satisfy a published transaction,
  held previous transaction, pending exact coverage, or active interaction.
- Run host construction, CodeMirror setup, snapshot capture, and measurement
  only in content/maintenance lanes with hard time budgets.
- During motion, only project already-ready representations.
- Cancel obsolete preparation when actor generation, value, geometry, clip,
  style, DPR, or projection horizon changes.
- Park inactive hosts offscreen with pointer events disabled.
- Track blocked actor debt with hold age, blocked frame count, visible actor
  count, and starvation reason.
- Emit a starvation report with actor id, actor kind, generation id, required
  representation, blocked reason, pending work id, age, blocked frame count,
  budget that blocked progress, and outcome.
- In dev and test, starvation beyond the configured age/frame budget fails
  loudly. In production, warm Settings text-like actors hold previous or block;
  typed placeholders are allowed only for explicit cold-start actor contracts.

Acceptance criteria:

- Host preparation cannot create long tasks during motion.
- Snapshot eviction cannot evict resources protected by the published or held
  transaction.
- Missing visible readable values produce blocked coverage, not blank success.
- Blocked visible actors either make progress, hold previous only within the
  configured age budget, or fail loudly with a starvation report.
- Starvation telemetry identifies the blocked actor, blocked budget, pending
  work, age, frame count, and chosen outcome.
- Visible value coverage remains readable under the configured live-host
  budget by using exact snapshots or compatible previous coverage when live
  hosts are not available.

## Workstream 8: Replace Ad Hoc Projection With A Browser Actor Projector

Build a single browser actor projector for DOM-control and DOM-island layers.
It should use CSS-pixel geometry and shared projection samples, borrowing the
matrix-transform discipline from `three-html-render` without importing that
library.

Implementation targets:

- Project every browser actor from committed flow-space geometry plus one
  `LiveProjectionSample`.
- Apply the same sample id and transaction id to canvas and browser layers.
- Produce projection readiness for each published representation: transform,
  CSS-pixel clip, z-order, hit mapping, activation mapping, and transaction id.
- Clip actors to section and retained surface clip chains in CSS pixels.
- Park or hide actors when their representation is not part of the published
  transaction.
- Keep active browser-owned controls live through scroll, pan, zoom, focus,
  selection, and composition.
- Preserve native pointer/focus semantics. Do not emulate text input in
  canvas.

Acceptance criteria:

- Browser actor rects stay within tolerance of retained row/control slots
  during pan, zoom, and retained section scroll.
- Pan, zoom, and retained-scroll motion update projection readiness without
  invalidating representation readiness.
- Active text editing remains native and visible across projection frames.
- Passive browser actors do not intercept pan/zoom gestures except through an
  explicit activation policy.

## Workstream 9: Tighten Chrome Recording Evidence

Chrome recordings should become stronger evidence, not a separate mode.

Implementation targets:

- Extend the recording collector/analyzer to capture:
  - final screenshots or CDP screenshots for configured value/control clips;
  - sampled RAF cadence;
  - long tasks;
  - console/page errors;
  - visible retained row samples with screenshot-backed ink statistics;
  - normal-vs-recorder rendering parity when a paired Playwright sample exists.
- Fail recordings that have no visual finish-line window or no screenshot-backed
  evidence for text-like values.
- Keep descriptor counts as diagnostics only.

Acceptance criteria:

- A recording like the current failing one cannot pass the finish-line report.
- A report cannot claim visual success if screenshots timed out unless an
  explicit alternative pixel source was captured and checked.
- Recording artifacts point directly to the blank or nonblank value clips.

## Workstream 10: Delete Obsolete Paths

No transitional compatibility code.

Delete or replace:

- `domControlPlaneProgressiveMount.ts` as a React-frame mount throttler;
- recorder-flag rendering policy;
- descriptor-only browser-owned actor completeness;
- React semantic snapshot as browser visual projection authority;
- any broad fallback that turns missing browser coverage into a successful
  publish;
- any tests whose primary oracle is only a mirrored implementation counter.

Acceptance criteria:

- There is one browser visual actor publication path.
- Missing coverage fails loudly with a typed reason.
- The code has no old/new renderer toggle.

## Implementation Sequence

Implement in this order:

1. Add the failing observed-behavior tests and evidence gates, especially
   recorder parity, nonblank value clips, IME/caret, passive-to-active
   handoff, and starvation.
2. Delete recorder-specific rendering policy so
   `window.__SETTA_CHROME_REPRO_ACTIVE__` cannot affect renderer choice, host
   budget, mount delay, representation type, or coverage policy.
3. Add the `BrowserVisualActor` contract as a `surfaceCompositor/` adapter.
4. Wire actual browser actor coverage into `GpuFlowCommittedSurfaceFrame`
   publishability.
5. Introduce the runtime host, snapshot, and compatible-previous pools.
6. Replace ad hoc projection with the single browser actor projector.
7. Delete obsolete DOM-control progressive mount and descriptor-only
   completeness paths.

## Workstream 11: Verification Matrix

Run all verification from the same worktree after implementation.

Required focused tests:

```sh
pnpm -C frontend exec vitest run \
  src/gpuFlow/surfaceCompositor/surfaceTransaction.test.ts \
  src/gpuFlow/surfaceCompositor/htmlSurfaceActorAdapter.test.ts \
  src/gpuFlow/projectionRuntime.test.ts \
  src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts \
  src/gpuFlow/GpuFlow/flowSurface.test.tsx \
  src/gpuFlow/GpuFlow/domControlPlane.test.ts \
  src/gpuFlow/GpuFlow/domControlPlaneProjectionRuntime.test.tsx \
  src/gpuFlow/committedSurfaceFrame.test.ts
```

Required browser tests:

```sh
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-dom-control-observed-regressions.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-scroll-continuity.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-text-like-row-rendering.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings
```

Required browser scenarios:

- IME/composition during retained scroll and viewport pan/zoom;
- native selection and caret persistence across projection frames;
- passive-to-active text actor handoff with one actor identity and one
  transaction;
- z-order and clipping across DOM controls, DOM islands, retained popups, and
  browser actors;
- snapshot eviction and recreation under budget;
- blocked actor starvation under live-host exhaustion and delayed snapshot
  readiness.

Required recording verification:

```sh
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu" ./scripts/record-chrome-repro.sh --reset
./scripts/chrome_repro_gpuflow_finish_line_report.py --latest --markdown
```

Required final quality gate:

```sh
./scripts/quality/check.sh
```

Final evidence must include:

- failing-before and passing-after screenshots or pixel summaries for visible
  value/control clips;
- RAF cadence and long-task summaries for the observed interaction window;
- Chrome recording analyzer output;
- a short note confirming recorder mode no longer changes rendering policy.

## Definition Of Done

This plan is complete only when:

- the first failing observed-behavior tests pass without weakening their
  assertions;
- normal mode and recorder mode produce matching nonblank value/control
  evidence;
- retained Settings frame cadence remains within budget during the tested
  scroll and pan/zoom interactions;
- browser-owned actors feed the shared `surfaceCompositor/` transaction path
  without a parallel browser-only coverage proof;
- the atomic visible publish sequence prevents canvas, browser actors, hit
  maps, activation maps, and debug evidence from exposing mixed transaction
  ids;
- every browser visual actor declares visibility, nonempty, coverage-required,
  and coverage-exemption reasons before coverage is computed;
- visible nonempty browser-owned actors are never counted complete without
  live, exact snapshot, or compatible previous coverage;
- representation readiness and projection readiness are separately proven;
- compatible-previous coverage is mechanically proven and bounded by age;
- snapshot memory and blocked actor starvation budgets are enforced;
- active text editing remains native and aligned;
- the latest Chrome recording finish-line report passes with screenshot-backed
  evidence;
- there is no recorder-specific rendering policy left in the frontend.
