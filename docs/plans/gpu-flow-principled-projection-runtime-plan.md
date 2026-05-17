# GPU Flow Principled Projection Runtime Plan

Date: 2026-05-19
Status: Implemented

This plan replaces the deleted GPU Flow content projection runtime refactor plan. It assumes no backward compatibility, no transitional dual paths, and no legacy runtime shims. The goal is to fix the scrolling/input desync and jank by replacing visible-frame authority, not by adding more patches around the current frame loop.

Internally, this should be treated as a projection runtime boundary replacement. It should not become a broader predicate around the current reason-coalesced frame system.

## Problem

The latest Chrome recording shows two distinct failures that share one architectural cause: motion projection and content publication are not separated strongly enough.

Observed from the recording:

- Projection-only frames are fast. Viewport-only frames averaged about 0.33 ms and retained-scroll-only frames averaged about 0.90 ms.
- Jank appears when motion reasons are coalesced with `paint`, `manual`, or `texture-upload`. The current `shouldRenderGpuFlowProjectionOnlyFrame` predicate requires every reason to be motion-like, so mixed input frames fall back to the full content path.
- Large section scrolls then run content work in the input frame. After navigating to All Settings, retained-scroll content frames were consistently above the 8.5 ms budget, with some frame gaps in the 40 to 75 ms range.
- Input fields lag and become misaligned because the DOM control plane is still tied to committed React/content frames for mount selection, while the canvas can advance by projection. During scroll, the projection frame moves already-mounted controls, but it cannot synchronously promote the correct controls, snapshots, or coverage for the newly visible area.
- Momentary disappearance is consistent with coverage being published before the required text/control representation is ready, or with a content frame replacing a coherent previous projection with a partially prepared one.

The current system has a fast path, but the fast path is optional. A principled fix should make motion projection the only visible path during motion, with content preparation happening behind it.

## Constraints

- Do not reintroduce the old "canvas owns text pixels" model for editable or selectable text.
- Do not let React reconciliation sit on the scroll hot path for DOM control mount selection.
- Do not use a compatibility layer that keeps both the old and new control planes alive.
- Do not add heuristic fallbacks that silently publish incomplete visual coverage.
- Do not implement this as "better projection-only predicates plus more prewarming." Reasons may remain as diagnostics, but they must not own visible publication.
- Do not let "previous" mean stale content. Previous coverage is valid only when it has an explicit compatibility proof.
- Do not accept implementation-detail tests as the primary guardrail. The tests must observe user-visible behavior such as frame cadence, blanking, alignment, and activation correctness.

## Borrowed Ideas

The example repositories in `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` point toward a consistent model:

- `html-in-canvas-official`: keep source DOM, captured pixels, and visible projection as separate concepts. A capture should not count as ready until the browser has produced a paintable snapshot, and the DOM transform used for native interaction must be synchronized with the drawn location.
- `three-html-render`: use a standalone interaction/projection manager, matrix transforms, and native DOM semantics for focus, hover, caret, selection, and form state. Do not drive this from React every frame.
- `html-in-canvas-cracks`: use CSS pixels as the stable coordinate space, use a fixed/compositor-pinned stage, treat scroll as an explicit projection term, and hold the last coherent output until the next one is ready.
- `compiz-web`: keep old and new visual states explicit during transitions. This is useful for preventing blanking: a previous coherent projection remains valid while replacement content is prepared.
- `html-in-canvas-room`: map native events through CSS transforms instead of synthetic event replay where possible.
- `html-in-canvas-dot-dev`: keep smoke tests focused on observable rendering outcomes: nonblank pixels, console health, and browser-level behavior.

What we should not borrow is full-page texture upload on every scroll frame or a generic polyfill surface. GPU Flow needs a specialized projection runtime for large retained application scenes.

## Target Architecture

Core invariants:

- A visible frame combines exactly one immutable committed content frame with exactly one `LiveProjectionSample`.
- Canvas geometry, DOM-control transforms, hit testing, activation mapping, and debug overlays must never come from different samples.
- A projection transaction captures one immutable `LiveProjectionSample` at transaction start. Input or scroll changes that arrive during the transaction create a later sample and may only publish in a later transaction.
- Every visible frame is a motion projection transaction, a content publication transaction, or an explicit held-previous transaction. Maintenance never publishes visible motion.
- A content publication transaction must publish the new committed content frame through the latest publishable `LiveProjectionSample`, or it must be followed immediately by a motion projection transaction using that latest sample. It must never reset viewport or retained-scroll position to the sample that existed when content preparation began.
- A held-previous transaction keeps the previous visible projection's draw state, DOM transforms, hit projection, activation mapping, and debug state together. It must not pair previous pixels with a newer hit map, newer activation mapping, or newer projection sample.
- During motion, projection may choose among already prepared live, snapshot, or compatible-previous representations. It may not create a new representation.
- A click resolves through the same committed content frame and the same `LiveProjectionSample` that drew the visible target.
- `compatible-previous` requires proof that the previous visual representation still matches the current actor generation, geometry contract, and activation policy. It must not be a stale fallback.

### 1. Motion Projection Runtime

Introduce a runtime-owned `LiveProjectionSample` as the only source of truth for motion-visible state.

It should include:

- viewport transform
- retained section scroll offsets
- input gesture owner
- monotonic sample id
- frame timestamp
- device pixel ratio and CSS-pixel viewport

Every visible surface reads the same sample for a frame: canvas draw list, DOM control transforms, hit testing, debug overlays, and activation mapping. A frame must never combine canvas geometry from one scroll sample with DOM transforms from another.

Wheel burst ownership is part of the live sample. During a wheel burst, moving over a projected DOM control must not change the burst owner or cause a mixed projection/content frame.

### 2. Visible Publication Scheduler

Replace visible publication scheduling, not just the projection predicate. The current reason-coalesced decision lets `paint`, `manual`, or `texture-upload` poison a motion frame. The new scheduler should preserve raw reasons for diagnostics, but visible publication must be lane-owned:

- `motion`: viewport pan/zoom and retained scroll projection. This lane runs first and never performs content publication or React mount selection.
- `content`: committed frame publication, actor catalog changes, layout changes, value changes, page membership changes.
- `maintenance`: texture uploads, DOM snapshots, retained page preparation, host pool warmup, diagnostics.

If motion and content are both pending, the frame publishes motion first against the last coherent committed content frame. Content remains queued for a later frame. Dirty content must not poison the motion path.

A mixed `retained-scroll + paint + texture-upload` request is not a mixed visible frame. It is a motion frame with pending content and maintenance debt.

The scheduler must also define catch-up states so smooth motion does not become stale motion:

- `motion-active`: publish unpresented motion samples first. Content and maintenance may run only if there is no unpresented motion sample, or if a bounded interleave slot cannot delay the next motion frame.
- `motion-settling`: continue prioritizing motion until input has stopped for the configured settle window.
- `content-catchup`: drain content publication debt before passive maintenance.
- `maintenance-drain`: prepare near-future representations, snapshots, textures, and host warmup inside explicit budgets.
- `idle`: run passive diagnostics and opportunistic preparation.

Scheduler policy must use named knobs rather than scattered `requestAnimationFrame` heuristics:

- `motionSettleWindowMs`
- `maxContentInterleaveMs`
- `maxMaintenanceInterleaveMs`
- `maxConsecutiveMotionFramesBeforeContentProbe`
- `maxHeldPreviousFrames`
- `maxHeldPreviousMs`

Continuous-motion backpressure:

- continue publishing unpresented motion samples first
- allow bounded content publication only when it can publish through the latest sample
- allow maintenance only for visible or active-pinned blockers before passive near-future work
- never let passive maintenance delay an unpresented motion sample

### 3. Immutable Committed Content Frame

Keep an immutable committed content frame that represents content identity, geometry, and coverage requirements, not live motion.

It should contain:

- retained page descriptors
- text/control actor descriptors
- DOM island descriptors
- GPU-native visual actors
- hit regions in committed coordinates
- coverage requirements and readiness proofs
- projection policy and owner for each actor

React may help produce committed content, but once committed, the projection runtime consumes it without React involvement during scroll.

The committed content frame owns:

- actor identity
- semantic generation
- visual generation requirements
- activation policy
- flow-space geometry
- lifecycle ownership
- coverage requirements

### 4. Projection Transaction

Each visible frame becomes a projection transaction:

1. Read one immutable committed content frame.
2. Read one `LiveProjectionSample`.
3. Resolve the projection horizon.
4. Produce canvas draw commands, DOM transform batch, hit projection, and diagnostics from the same sample.
5. Publish only if coverage is coherent; otherwise hold the last coherent visible projection.

Each projection transaction has a transaction id that binds the committed frame id and projection sample id. Canvas draw commands and DOM-control transform batches publish under that same transaction id. If either side cannot publish coherently, the transaction holds previous.

Debug attributes should expose committed frame id, projection sample id, and transaction id on the canvas surface and DOM-control plane so tests and logs can detect split-brain presentation.

The transaction may move, clip, and choose among already prepared representations. It may not create content, mount React nodes, run CodeMirror setup, assign a newly created live host, upload required textures synchronously, or mark incomplete coverage as good enough.

If no valid representation exists for a visible actor, projection must hold the previous coherent projection or mark the actor blocked. It must not publish a visual hole as success.

Publication policy:

| Visible actor state | Previous coherent projection exists? | Publish decision |
| --- | --- | --- |
| `live` | either | Publish. |
| `snapshot` | either | Publish only if the actor activation policy allows snapshot coverage. |
| `compatible-previous` | yes | Publish with the compatibility proof attached. |
| `blocked-awaiting-browser-visual` | yes | Hold previous. |
| `blocked-awaiting-browser-visual` | no | Publish a diagnosed cold placeholder only when the actor contract explicitly allows it. |
| `blocked-awaiting-live-host` | yes | Hold previous. |
| `blocked-awaiting-live-host` | no | Publish a diagnosed cold placeholder only when the actor contract explicitly allows it. |
| `true-hole` | either | Do not publish as covered. |

This matrix keeps cold-start behavior explicit. A blocked actor is not a generic placeholder path.

Cold placeholders for text/control actors are noninteractive by default. They may accept interaction only when the actor contract explicitly provides a valid activation mapping.

### 5. Runtime-Owned Text And Control Projection

Replace the current React-frame-owned DOM control mount selection with a runtime-owned text/control projection manager.

Responsibilities:

- maintain a bounded pool of live DOM hosts
- pin active, focused, composing, selected, or recently edited controls
- prepare live host assignments for the current and near-future projection horizon using spatial priority
- provide snapshot or compatible-previous coverage for non-live controls
- expose explicit coverage states: `live`, `snapshot`, `compatible-previous`, `blocked-awaiting-browser-visual`, `blocked-awaiting-live-host`, and `true-hole`
- apply CSS transforms from the shared `LiveProjectionSample`
- keep native browser focus, caret, selection, IME, and accessibility for live controls

The manager should not mount hundreds of CodeMirror instances. It should keep the number of live hosts bounded, but it must make that bounded set projection-aware instead of React-commit-aware.

This manager must not become a second renderer with independent identity and lifecycle semantics. The committed content frame owns actor identity, semantic generations, and coverage requirements. The projection manager owns bounded live hosts, transforms, pinning, prepared representation assignment, and coverage state.

The projection manager owns:

- live host pool
- prepared representation registry
- pinning
- projection transforms
- clipping
- representation assignment state
- coverage state reporting

It must not decide what a control is, what value it has, where it lays out, or how it activates.

Host handling is split into three phases:

- `prepare`: maintenance mounts or initializes hosts, constructs CodeMirror if needed, measures, and records readiness.
- `promote`: content or maintenance marks a prepared representation available for a specific actor generation and activation policy.
- `project`: motion applies transforms and clipping to already promoted representations.

Motion may only perform `project`. It must not mount, initialize, measure, semantically bind, or construct a host.

IME/composition is a hard live pin. A composing text actor cannot downgrade to snapshot or compatible-previous coverage. It must remain live, or the transaction must hold previous.

Interaction-critical controls are live-or-hold unless the actor contract explicitly says downgrade is safe:

- composing or IME-active text
- focused text with selection
- active text during an uncommitted edit
- native control drag
- file picker or dropzone interaction

Live host overflow uses deterministic priority:

1. composing or IME-active
2. focused active editor
3. selected or recently edited
4. visible and interactable
5. visible passive readable
6. near-future passive
7. maintenance or prewarm

Overflow produces a coverage state with a reason, not an ad hoc unmount. The valid outcomes are snapshot coverage when the actor allows it, compatible-previous coverage when proof succeeds, or `blocked-awaiting-live-host`.

Snapshot invalidation is owned by the committed content frame generation, not by the projection manager.

### 6. Real Projection Horizon

Replace the current effectively zero retained-scroll horizon with a real horizon model.

The horizon should be expressed in CSS pixels and include:

- current visible viewport
- scroll direction and velocity
- near-future retained section range
- active editor protection range
- small overscan for visual continuity
- hard preparation budget

The horizon is a contract between projection and maintenance. It must separate obligations by publication behavior:

- `visible`: actors currently visible. These gate publication.
- `active-pinned`: active, focused, composing, selected, or protected actors. These gate publication when interaction correctness depends on them.
- `near-future`: actors likely to become visible soon. These drive preparation priority but do not block the current visible frame.
- `maintenance`: passive preparation and cleanup debt. These never block the current visible frame.

Maintenance uses near-future and maintenance obligations to prepare snapshots, live host assignments, and retained page resources outside the input frame.

The horizon should produce a concrete obligation list, not a heuristic hint:

- required visible actors
- near-future actors
- active and pinned actors
- acceptable representation type per actor
- preparation deadline or budget
- blocked reason when an obligation is unmet

Projection then has a deterministic decision: publish with valid coverage, use compatible-previous coverage, or hold the previous coherent projection.

### 7. Compatibility Proofs

`compatible-previous` must be mechanical and auditable. It cannot be a boolean set by intuition.

For text/control actors, the proof should include the relevant parts of:

- actor id
- semantic generation
- visual generation or snapshot cache-key revision
- control kind and activation policy
- flow-space rect
- clip-chain revision
- retained surface id
- retained scroll remap validity
- text value or display revision
- focus, active, selection, and composition state
- hit target id

For retained pages and texture-backed surfaces, the proof should include the relevant parts of:

- surface id
- page generation
- visual epoch
- source window compatibility
- zoom bucket or resolution compatibility
- clip-chain revision
- retained scroll compatibility
- hit/source mapping compatibility

Every successful compatibility proof should emit a reason code that can be logged and inspected.

### 8. Retained Page And Texture Projection

Retained page textures and HTML texture actors should follow the same source/capture/visible split:

- source: DOM or retained page content that can produce visual pixels
- capture: texture or snapshot with a readiness generation
- visible projection: transform and clipping for one `LiveProjectionSample`

Texture upload and capture are maintenance work. Scroll frames may use the newest ready capture or hold the previous coherent capture, but they must not synchronously wait for capture.

Snapshots need visual generation, semantic generation, readiness proof, and activation policy. Snapshot coverage is not a substitute for freshness unless the actor contract says it is acceptable for the current projection.

### 9. Native Interaction Mapping

Use the projection runtime to map native interaction to the visible projected location.

For live DOM controls, prefer CSS transforms on compositor-pinned hosts so the browser owns focus, selection, caret, IME, and accessibility. For canvas-owned hit targets, use the same `LiveProjectionSample` and committed frame to resolve hits. Do not maintain separate interaction geometry from visible geometry.

A click after scroll is a correctness test for the architecture. If hit testing uses a newer content frame, an older retained-scroll offset, or separately computed DOM geometry, the architecture is still broken even if screenshots appear aligned.

### 10. No Hidden Work In Motion Audit

Make the motion lane small enough to audit.

The motion lane must not:

- call React reconciliation paths
- mount or unmount React controls
- construct CodeMirror
- create or assign new live DOM hosts
- resolve retained display transactions
- create committed surface frames
- register, capture, or upload passive HTML textures
- run text snapshot capture
- publish incomplete coverage

Motion may sample the latest prepared committed content frame, read prepared representation registries, project already prepared actors, apply compositor-friendly transforms, and publish or hold.

### 11. Diagnostics

Add diagnostics only after the fail-first tests exist.

Useful logs:

- projection sample id and lane
- projection transaction id, committed frame id, and projection sample id
- whether a visible frame was a motion projection, content publication, or held previous projection
- max canvas-to-DOM alignment delta for sampled live controls
- visible text/control coverage counts by state
- live host pool size, pinned count, assignment churn, and overflow reason
- horizon size, preparation budget, and blocked actors
- max consecutive held-previous motion frames
- max held-previous duration during active scroll
- held-previous reason distribution
- percentage of scroll frames that publish compatible projection versus hold
- frame budget, long task, and frame gap summary

These diagnostics should explain failures without becoming the primary test oracle.

## Implementation Plan

### Step 1: Add Fail-First Observed-Behavior Tests

Create tests that reproduce the current bug and fail on the current implementation before refactoring.

Test cases:

- Large settings section scroll frame cadence:
  - Open a large project and navigate to Settings, then All Settings.
  - Replay the same interaction shape as the Chrome recording: click All Settings, wheel-scroll retained sections, and continue interacting during scroll.
  - Use browser-observed `requestAnimationFrame` cadence and `PerformanceObserver` long task data.
  - Fail if p95 frame gap exceeds the target budget, if p99 exceeds one 60 Hz frame by a meaningful margin, or if any interaction causes a long task above 50 ms.

- Input alignment during retained section scroll:
  - Track a representative set of visible editable text controls while wheel-scrolling a retained section.
  - Compare browser-observed DOM control bounds against the visible canvas/control slot location from screenshots or pixel probes on each animation frame.
  - Assert that canvas and DOM-control plane debug attributes expose the same committed frame id, projection sample id, and projection transaction id at each alignment sample.
  - Fail if maximum sustained drift exceeds 1 to 2 CSS pixels, or if the control visibly lags behind the section content.

- Visual continuity during scroll:
  - Capture screenshots or video frames through a retained section scroll.
  - Fail if a previously visible field region becomes blank, transparent, or replaced by a placeholder while the surrounding section remains visible.
  - Fail if a coherent previous visual projection is dropped before replacement coverage is ready.

- Activation correctness after scroll:
  - Scroll a retained section and immediately click a visible text field.
  - Assert that canvas and DOM-control plane debug attributes expose the same committed frame id, projection sample id, and projection transaction id at the activation moment.
  - Fail if focus, caret location, selected value, or typed input attaches to a stale row or to a visually different control.

- Mixed dirty-reason motion regression:
  - Trigger retained scroll while paint or texture-upload work is pending.
  - Observe frame cadence and visual alignment only.
  - Fail if the visible motion frame hitches or if DOM controls desynchronize from the projected section.

- Wheel burst ownership continuity:
  - Start a wheel burst over retained content, move over a projected DOM control during the burst, and continue wheel input.
  - Fail if the burst owner changes unexpectedly, if the scroll target changes visually, or if the interaction causes a mixed projection/content frame.

- Content publication during retained scroll:
  - Start retained scroll, then trigger a value, layout, or content change during the scroll.
  - Verify motion continues through live projection while content publication remains queued as debt.
  - Verify content publication catches up without snapping viewport or retained-scroll position backward.
  - Verify the next click resolves through the post-catchup committed frame and latest publishable sample.

These tests should live in `frontend/tests/` if they require Playwright/browser recording support, with any focused frontend unit helpers placed beside `frontend/src/*` code. The primary assertions must be based on browser-observed behavior, screenshots, video frames, DOM geometry, and performance entries, not internal function calls or private runtime counters.

### Step 2: Define Type-Level Projection And Content Contracts

Before replacing scheduler code, define the vocabulary that the new runtime boundary will enforce.

Contracts:

- `LiveProjectionSample`
- `CommittedContentFrame`
- `ProjectionTransaction`
- `ProjectionCoverageState`
- `HeldPreviousProjection`
- `ProjectionHorizonObligation`
- `CompatibilityProof`
- `ProjectionTransactionId`

Acceptance:

- The contracts can represent motion projection, content publication, and held-previous transactions without falling back to old frame objects.
- The committed content frame shape is defined enough for the scheduler and projection transactions to depend only on the new contracts.
- Coverage states distinguish `live`, `snapshot`, `compatible-previous`, `blocked-awaiting-browser-visual`, `blocked-awaiting-live-host`, and `true-hole`.
- Held-previous state carries draw state, DOM transforms, hit projection, activation mapping, debug state, committed frame identity, and projection sample identity together.
- Horizon obligations distinguish visible, active-pinned, near-future, and maintenance work.
- Compatibility proof types require explicit actor-specific reason codes.
- Transaction identity binds committed frame id, projection sample id, and projection transaction id.

### Step 3: Replace Visible Publication Scheduling

Implement the `LiveProjectionSample` producer and replace the current reason-coalesced visible publication decision. Motion events should produce samples and request the motion lane. Content and maintenance work should remain pending when motion is active.

Reasons may still be recorded, logged, and used to enqueue work, but they must not decide whether a visible motion frame falls back to content publication.

Acceptance:

- A mixed `retained-scroll + paint + texture-upload` situation visibly publishes a motion projection first.
- Dirty content and maintenance work remain queued as debt instead of running inside the motion frame.
- Content publication uses the latest publishable `LiveProjectionSample` or is immediately followed by a motion projection that does.
- Each transaction captures one immutable `LiveProjectionSample` at transaction start.
- Motion frame code has no path that performs React reconciliation, live control host assignment, CodeMirror construction, retained transaction resolution, committed frame creation, capture, or synchronous texture upload.
- Scheduler states cover `motion-active`, `motion-settling`, `content-catchup`, `maintenance-drain`, and `idle`.
- Scheduler policy uses named knobs for settle windows, content interleave, maintenance interleave, content probes, and held-previous limits.
- Continuous-motion backpressure allows content catchup only through the latest sample and allows maintenance only for visible or active-pinned blockers before passive work.
- After motion settles, content publication debt drains before passive maintenance.

### Step 4: Complete The Immutable Content Frame Contract

Complete the committed content frame contract for retained pages, text/control actors, DOM islands, GPU-native visuals, hit regions, coverage requirements, and owner metadata. Step 2 defines enough of this shape for the scheduler and projection transaction contracts; this step fills in the actor-specific details.

Acceptance:

- Projection code consumes immutable frame data plus a live sample.
- Actor coverage and readiness are explicit.
- Hidden dependencies on React render timing are removed from the projection path.

### Step 5: Replace The DOM Control Plane With A Projection Manager

Delete the React-frame-owned DOM control mount selection path and replace it with a runtime-owned manager.

Acceptance:

- Live DOM host count is bounded.
- Active controls are pinned.
- Prepared host assignment is spatially prioritized by the current and near-future horizon.
- Live host transforms are applied from the same `LiveProjectionSample` as the canvas.
- Non-live controls have explicit snapshot, compatible-previous, blocked-awaiting-browser-visual, blocked-awaiting-live-host, or true-hole coverage.
- Actor identity, semantic generation, and lifecycle ownership remain in the committed content frame, not in the projection manager.
- Host handling is split into prepare, promote, and project phases.
- Motion only projects already promoted representations.
- Composing text actors remain live or cause the transaction to hold previous.
- Interaction-critical controls remain live or cause the transaction to hold previous unless the actor contract explicitly allows downgrade.
- Live host overflow follows the deterministic priority list and produces an explicit coverage state with a reason.
- Snapshot invalidation is owned by committed content frame generation.

### Step 6: Implement Real Retained Scroll Horizons

Replace zero-horizon retained scroll preparation with visible and near-future ranges.

Acceptance:

- The horizon moves with scroll velocity and direction.
- The horizon emits a concrete obligation list for visible, active-pinned, near-future, and maintenance work.
- Visible and active-pinned obligations gate publication when correctness depends on them.
- Near-future and maintenance obligations drive preparation priority but do not block the current visible frame.
- Maintenance prepares just outside the visible range without entering the scroll frame.
- Projection refuses to publish incomplete visible coverage and either uses compatible-previous coverage or holds the previous coherent projection.

### Step 7: Move Capture And Upload Work To Maintenance

Convert text snapshots, HTML texture captures, retained page texture uploads, and host warmup into budgeted maintenance tasks.

Acceptance:

- Maintenance can fall behind without breaking motion projection.
- Scroll frames never synchronously wait for capture or upload.
- The runtime records why any actor is blocked instead of silently publishing holes.
- Continuous motion has explicit draining rules so content and maintenance debt do not starve forever.

### Step 8: Unify Hit Testing And Activation With Projection

Make hit testing, text activation, focus transfer, and debug overlays consume the same content frame and `LiveProjectionSample` as drawing.

Acceptance:

- A click after scroll resolves to the visually clicked actor.
- Focus and caret placement match the visible field.
- Interaction resolves through the same committed content frame and `LiveProjectionSample` as the visible target.
- There is no separate stale geometry path for interaction.

### Step 9: Delete Superseded Paths

Remove old paths instead of keeping compatibility switches.

Remove:

- all-or-nothing projection-only gating based on coalesced reason sets
- React render driven DOM control mount selection for scroll projection
- any canvas text fallback for editable/selectable controls
- silent publish paths for incomplete text/control coverage
- synchronous texture-upload or snapshot work from motion frames
- motion paths that resolve retained display transactions or create committed surface frames
- stale previous coverage paths without explicit compatibility proof
- held-previous paths that pair previous pixels with a newer hit map or activation mapping
- text/control projection manager ownership of parameter values, actor identity, semantic generations, layout, or activation policy
- content publication paths that reset viewport or retained-scroll position to an older preparation-time sample
- text/control placeholder interaction without an explicit activation mapping

Acceptance:

- There is one production projection runtime.
- Tests do not need feature flags or compatibility modes.

### Step 10: Add Diagnostics And Perf Reports

After the runtime is structurally correct, add logs and append-only perf reports under `perf/`.

Acceptance:

- Before/after reports include the fail-first scenarios.
- Reports include frame cadence, long tasks, blanking/alignment results, coverage state summaries, transaction id consistency, and wheel burst ownership continuity.
- Reports include max consecutive held-previous motion frames, max held-previous duration during active scroll, held-previous reason distribution, and compatible-projection versus hold percentage.
- Diagnostics can explain failures without being required for the primary test assertions.

### Step 11: Full Verification

Run the focused fail-first tests until they pass, then run broader frontend and repository checks.

Expected commands:

- `pnpm -C frontend exec vitest run <focused frontend tests>`
- `./scripts/run-playwright-e2e.sh <focused e2e test or project>`
- `./scripts/quality/check.sh`

Also record a new Chrome repro bundle using the same workflow as the original issue and compare it against the baseline in `perf/`.

## Risk Controls

- The text/control projection manager must not become a parallel renderer. It projects prepared actor representations owned by committed content frames.
- The text/control projection manager must not own parameter values, actor identity, semantic generations, layout, renderer-specific descriptors, or activation policy.
- Motion priority must not starve content forever. Add post-motion draining and budgeted interleaving rules for continuous motion.
- Scheduler timing policy must be controlled by named knobs, not scattered frame-loop heuristics.
- Snapshot coverage must remain disciplined. Each snapshot needs a visual generation, semantic generation, readiness proof, and activation policy.
- Snapshot invalidation must remain owned by committed content frame generation.
- Holding previous coverage must not become frozen scroll. Prefer compatible projection when it is provably safe, and hold only when publishing would otherwise create an incoherent visual frame.
- Cold-start blocked states must follow the publication matrix. They cannot silently become placeholders.
- Cold placeholders for text/control actors are noninteractive unless the actor contract provides a valid activation mapping.
- Content publication must never snap viewport or retained-scroll position back to the sample that existed when content preparation began.
- Live host overflow must follow the deterministic priority order and emit an explicit coverage state with a reason.

## Acceptance Criteria

- During retained section scroll, visible canvas content and live DOM controls remain aligned within 1 to 2 CSS pixels.
- Retained scroll and viewport motion remain smooth in large projects: no long tasks above 50 ms during the tested interaction, p95 frame gaps within the target high-refresh budget, and p99 below a visible hitch threshold.
- No visible field region blanks or disappears while surrounding section content remains visible.
- Clicking or typing immediately after scroll targets the visually selected field.
- Mixed dirty work cannot force a motion frame down the content publication path.
- Live DOM host count remains bounded while preserving active editor correctness.
- All visible text/control coverage has an explicit ready or blocked proof.
- Every visible frame is classified as motion projection, content publication, or held previous; there are no mixed visible frames.
- `compatible-previous` coverage carries an explicit proof and is never a stale fallback.
- Held-previous transactions hold pixels, DOM transforms, hit testing, activation mapping, debug state, committed frame identity, and projection sample identity together.
- Near-future obligations never block the current visible frame.
- Live host lifecycle follows prepare, promote, and project phases, with motion limited to project.
- Content publication uses the latest publishable `LiveProjectionSample` or is immediately followed by motion projection using that sample.
- Projection transactions expose a consistent transaction id across canvas and DOM-control publication.
- Transaction samples are immutable. Input that arrives during a transaction publishes only through a later transaction.
- Composing or IME-active text actors remain live or cause the transaction to hold previous.
- Focused selection, uncommitted edit, native drag, file picker, and dropzone interactions remain live or hold unless explicitly downgrade-safe.
- Held-previous overuse is bounded and reported by consecutive-frame count, duration, reason distribution, and compatible-projection versus hold percentage.
- Cold placeholders for text/control actors are noninteractive by default.
- Wheel burst ownership remains stable across projected DOM controls.
- Scheduler behavior is governed by named budget knobs, including settle window, content interleave, maintenance interleave, content probe, and held-previous limits.
- Content publication during retained scroll catches up without snapping viewport or retained-scroll position backward.
- Live host overflow follows the documented priority order and never causes ad hoc unmounts.
- Snapshot invalidation is determined by committed content frame generation, not projection manager state.

## Rollback Position

Rolling back to an earlier commit may be a short-term product decision if the current branch is unusable, but it is not the long-term fix. The old designs still leave at least one of these problems unsolved: canvas-owned text pixels, unbounded live DOM, React on the scroll hot path, or weak coverage guarantees. The long-term path should be a clean replacement of the projection runtime boundary rather than compatibility around the current one.
