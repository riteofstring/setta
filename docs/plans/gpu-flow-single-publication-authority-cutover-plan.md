# GPU Flow Single Publication Authority Cutover Plan

## Context

This replaces the deleted browser visual actor runtime plan. The latest Chrome
recording after that implementation showed a different class of failure than
the original "recorder flag changes host mounting" bug:

- browser visual hosts were present and sampled live host clips were nonblank;
- React logged a render-phase update warning while rendering `GpuFlow`;
- the Settings transition produced a long task above the 50 ms guardrail;
- projection held a previous visible frame far beyond the 6 frame / 120 ms
  budget, including a multi-second retained-projection coverage miss;
- retained DOM-control descriptor counts looked complete even while the
  visible-frame contract could still be stale or mixed-generation.

The issue is not that GPU Flow should stop using browser DOM for readable or
editable text. The issue is that browser visual actor preparation, retained
projection, DOM-control projection, canvas publication, hit/debug state, React
semantic state, resource protection, and scheduler debt are still allowed to
advance under split publication authority.

## Goal

Cut GPU Flow over to one publication authority:

> A visible frame is a transaction. Browser-owned and GPU-owned actors may be
> prepared independently, but no visible layer may advance unless the whole
> frame publishes coherently.

The refactor should collapse publication authority currently spread across
committed-surface publication, browser visual readiness, projection hold logic,
React semantic publication, resource protection, and scheduler debt clearing.
Specialized runtimes may still prepare candidates, but only the transaction
kernel decides whether the visible frame committed, held previous, or blocked.

The plan is intentionally not a full GPU Flow rewrite. It preserves the
WebGPU-owned project runtime, retained pages, browser-owned text semantics,
DOM-control actors, DOM islands, and motion/content/maintenance lanes. The
cutover is narrow: one authority for visible publication.

Settings is only the benchmark and stress fixture for this work. The fix must
land in general GPU Flow runtime contracts, actor-family adapters, publication
policy, and recording/probe evidence. Do not add Settings-specific rendering,
projection, scheduling, host-budget, snapshot, or recovery behavior.

## Non-Goals

- Do not return Settings to a DOM-rendered page.
- Do not move passive readable text-like values back to canvas-drawn text.
- Do not add recorder-specific rendering branches.
- Do not add Settings-specific optimizations or special cases. Settings should
  expose runtime failures; it should not receive a private fast path.
- Do not increase held-previous budgets to mask missing coverage.
- Do not add a transaction wrapper while leaving old publication decisions
  alive underneath it.
- Do not add backward compatibility, dual-read/write publication paths,
  compatibility aliases, transitional publishers, or legacy fallback publishers.
  Actor-family adapters are allowed only when they prepare candidates and cannot
  publish visible state.
- Do not treat descriptor counts as visual proof.

## Non-Negotiable Invariants

- There is exactly one visible-frame outcome per RAF: `commit`,
  `hold-previous`, or `blocked`.
- Every subsystem reports candidates into that outcome; no subsystem publishes
  visible state around it.
- The kernel owns authority over normalized actor proofs, resource references,
  publication debt, and projection samples. Actor-family adapters own domain
  internals.
- Prepared candidates cannot emit React store updates, mutate DOM-control or
  DOM-island visible snapshots, publish dataset frame ids, advance hit/debug
  identity, clear scheduler debt, or release previous-frame resources.
- Visual proof and interaction proof are separate. A snapshot can prove passive
  pixels, but it cannot prove active editing, focus, IME, native selection, or
  live hit ownership.
- `compatible-previous` is a proof state, not a fallback. It must carry actor
  generation, projection sample, clip-chain compatibility, hit mapping, resource
  identity, and age.
- Motion may advance using compatible previous coverage only while the
  transaction proves compatibility and remains inside the held-previous budget.
- Over-budget hold is not publication. It forces a repair lane or produces a
  diagnosed blocked frame.
- A commit clears only the debt satisfied by the committed proof. A motion
  commit with compatible-previous coverage may clear motion/projection debt, but
  it must not clear retained-page repair, browser snapshot, live-host
  assignment, active-editor, or exact-content debt that remains represented by
  compatible-previous proof.
- React semantic publication is downstream of visible publication. React may
  observe the committed result, but it does not decide visible publication.
- Visible browser actor projection, visibility, clipping, dataset frame ids,
  hit ownership, and resource protection are applied synchronously by the
  publication executor for the committed transaction. React reconciliation must
  not be required to make the committed visible frame true.
- A `CommitPublicationToken` is minted only after actor proofs are valid,
  resources are protected, DOM generation N is staged and exposable, canvas
  generation N is prepared and exposable, and the DOM/canvas presentation pair
  can expose together.
- Browser snapshot resources are retained-page-like resources with identity,
  generation, protection, and explicit release.
- Motion transactions prove compatibility from committed manifests and
  changed-sample deltas. They must not resample retained runtime frames, rebuild
  full actor families, upload textures, create content frames, or walk the full
  Settings scene.
- Blocked has visible semantics: the last coherent visible frame remains frozen,
  hit/debug identity stays tied to that frame, scheduler debt remains uncleared,
  Chrome recording receives a blocked-visible-publication event, and tests/dev
  guardrails fail loudly when the blocked state exceeds its budget.
- Cold-start blocked publishes a first-class shell frame, not a null frame.
- There is no visible mutation without an outcome-specific publication token
  from the single publication kernel.
- Every publication-critical mutator requires an unforgeable publication token
  created by the kernel for the selected transaction outcome. Commit, hold, and
  blocked tokens are distinct types so hold/blocked outcomes cannot be passed to
  mutators that advance visible generations or clear committed debt.
- Raw publication stores, raw resource releasers, scheduler debt mutation, and
  external-store emitters are private to publication modules. Actor-family
  adapters can import only tokenized candidate/preparation APIs and tokenized
  publication mutators.

## Ideas To Borrow From The Example Repos

The examples under
`/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` point to a
cleaner model. The plan should borrow the lifecycle ideas, not necessarily add a
new dependency.

- `html-in-canvas-dot-dev/spec/design-decisions.md`: the WICG model fires
  `paint` after the browser has locked the current rendering update. DOM
  changes made during paint affect later frames, not the current one. GPU Flow
  should mirror this: prepare browser visuals from an immutable input, then
  publish them only in a later explicit commit step.
- `hot-tips/html-in-canvas/AGENTS.md`: `layoutsubtree` children are browser
  layout and hit-test participants, but visible pixels are produced only by an
  explicit draw/capture operation. GPU Flow should separate source DOM,
  representation proof, and visible publication the same way.
- `three-html-render`: `HTMLTexture` treats "snapshot not available yet" as
  pending paint work, not as a partially visible state. GPU Flow should treat a
  missing browser visual snapshot as transaction debt, not as a reason to
  advance other visible layers.
- `three-html-render` interaction managers: DOM interaction is synchronized by
  one projection transform and native browser events, with unmanaged elements
  hidden or parked. GPU Flow should keep active/live DOM projection explicit and
  actor-owned instead of letting separate layers drift.
- `html-in-canvas-cracks`: the boot hand-off keeps the previous/opaque stage
  visible until the first successful HTML texture pipeline frame. GPU Flow
  should keep the previous coherent frame visible within budget and should not
  reveal a half-prepared browser visual frame.
- `html-in-canvas-cracks`: fixed viewport stage plus CSS-pixel geometry avoids
  scroll compensation races. GPU Flow should keep viewport/projection movement
  in the projection runtime and avoid DOM state mutation as the source of visual
  truth during motion.

## Step 1: Add Failing Observed-Behavior Tests

Add these tests before implementation work. They should fail on the current
runtime. Assertions should be based on user-observable behavior, browser
console/runtime health, frame cadence, and pixels, not internal transaction
names or implementation-only counters. Internal diagnostics may be recorded in
test output details for debugging, but should not be the primary oracle.

### 1. Settings Transition Runtime Health

Location: extend
`frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts`
or add
`frontend/tests/e2e/settings/settings-retained-visible-frame-coherence.spec.ts`.

Flow:

1. Open Settings.
2. Start a RAF cadence sampler and a `PerformanceObserver` long-task sampler.
3. Capture console errors, page errors, and unhandled rejections.
4. Click "All Settings".
5. Wait until a large retained Settings scene is visibly present.
6. Capture a final screenshot of the canvas/visible surface.

Assertions:

- no React render-phase update warning;
- no browser console error or page error;
- max long task is at or below the existing 50 ms guardrail;
- max RAF gap stays within the existing refresh-aware budget;
- final screenshot is nonblank and not a high-confidence placeholder.

This captures the latest recording's React warning and long task without
asserting which function emitted or which runtime object mutated.

### 2. Retained Scroll And Zoom Make Visible Progress Within Budget

Location: new Playwright spec beside the retained Settings compositor tests.

Flow:

1. Open All Settings and center a retained section with readable text-like
   controls.
2. Capture a stable screenshot clip of the visible retained section.
3. Dispatch a retained-section wheel scroll followed immediately by retained
   hover zoom.
4. Sample RAF intervals and capture the same screenshot clip at approximately
   60 ms, 120 ms, and after idle.

Assertions:

- at least one sampled screenshot changes meaningfully within 120 ms of input;
- within the same 120 ms window, either the screenshot changed or a
  committed/held-within-budget motion projection transaction advanced the
  sampled projection id; if neither happens, the failure must report whether the
  frame entered over-budget hold, blocked, or failed to publish diagnostics;
- the final screenshot differs from the initial screenshot in the expected
  region;
- sampled clips remain nonblank and do not become placeholder bands;
- RAF cadence remains within the existing retained compositor budget.

This catches a multi-second held-previous frame as a visible stale-frame
failure, independent of the internal `held-previous` representation. The
transaction/projection assertion is diagnostic support for classifying failures;
the primary oracle remains visible progress and cadence.

### 3. Browser Text Remains Interactive After Projected Motion

Location: same new spec.

Flow:

1. Open All Settings and center a retained section with a visible text-like
   browser-owned control.
2. Perform retained scroll and viewport/hover zoom.
3. Click the visible text-like control at its screen position.
4. Type a short token.

Assertions:

- focus reaches the browser-owned control;
- typed text appears in the visible control or the editor surface;
- the clicked point is not stale relative to the visible text;
- no page error or console error occurs during the gesture.

This verifies the user-visible contract that DOM projection and hit ownership
advance with the pixels.

### 4. Chrome Recording Mode Parity

Location: extend the existing Chrome repro parity coverage.

Flow:

1. Run the same Settings transition and retained scroll/zoom flow normally.
2. Run it again with `window.__SETTA_CHROME_REPRO_ACTIVE__ = true`.

Assertions:

- visible screenshot statistics stay equivalent;
- no additional console errors appear in recording mode;
- frame cadence and long-task budgets are not worse in recording mode by more
  than the existing jitter allowance.

This prevents a return to recorder-specific rendering policy.

### 5. Blocked Publication Fault Injection

Location: focused Vitest coverage for transaction decisions plus a narrow
Playwright probe for visible blocked semantics.

Inject failures that withhold one required proof or resource at a time:

- retained first-visible page;
- browser visual live host;
- browser snapshot artifact;
- compatible-previous proof after its age budget;
- resource referenced by the previous committed frame.
- cold startup with no coherent previous frame.

Assertions:

- the previous coherent frame remains visible;
- hit/debug identity remains tied to the previous committed frame;
- scheduler debt is not cleared for the withheld proof;
- a blocked-visible-publication event is emitted with the actor/resource reason;
- no DOM-control or DOM-island visible generation advances;
- candidate-owned resource release does not break the previous frame;
- tests/dev guardrails fail loudly when the blocked state exceeds its budget.
- cold startup blocked behavior uses the defined loading/error shell instead of
  silently publishing a mixed or blank frame.

This makes `blocked` a verified visible state, not just a log event or nominal
enum branch.

### 6. No Hidden Publisher Guard

Location: focused Vitest coverage for publication-critical mutators, plus one
Settings Playwright flow in dev/test mode.

In dev/test builds, wrap every publication-critical mutator and assert it
receives the required outcome-specific publication token:

- canvas visible frame identity;
- DOM-control visible snapshot;
- DOM-island visible snapshot;
- browser actor dataset frame ids;
- browser actor projection, visibility, clipping, hit ownership, and active
  editor routing;
- hit/debug identity;
- protected resource ownership and release;
- scheduler debt clearing.

Flow:

1. Run Settings transition.
2. Run retained scroll.
3. Run retained hover zoom.
4. Activate browser text.
5. Repeat with Chrome recording mode enabled.

Assertions:

- every guarded visible mutation has a token from the single kernel;
- no adapter path, React store path, scheduler path, resource path, or DOM layer
  path can mutate visible state without that token.
- raw publication stores, raw resource releasers, raw scheduler debt setters,
  and external-store emitters are not importable from actor-family adapters.

This is the mechanical enforcement test for the no-hidden-publishers invariant.

### 7. Active Editor During Motion

Location: new Playwright coverage beside the retained Settings browser-text
interaction tests.

Flow:

1. Open All Settings and activate a visible browser-owned text-like control.
2. Type a short token.
3. While the editor remains focused, perform retained scroll or viewport zoom.
4. Type a second token.

Assertions:

- the same logical actor remains focused and editable;
- caret/input mapping remains coherent after motion;
- typed text before and after motion lands in the same active editor;
- the committed transaction used an active-editor-capable proof rather than a
  passive snapshot or generic compatible-previous proof;
- no page error or console error occurs.

This protects active browser semantics during projection motion without forcing
motion to wait for fresh passive content.

## Step 2: Cut Over The Transaction Kernel

Introduce a single transaction kernel that owns the full visible-frame
publication attempt. This is not a wrapper around the old flow. It absorbs the
publication decisions currently split across:

- committed-surface publication;
- browser visual readiness and snapshot publication;
- projection hold logic;
- DOM-control and DOM-island visible snapshot publication;
- canvas-visible frame selection;
- hit/debug identity publication;
- React semantic snapshot publication;
- protected-resource retention and release;
- scheduler debt clearing.

The kernel may inspect normalized actor proofs, resource references,
publication debt, and projection samples. It must not reach into retained page,
DOM-control, browser snapshot, GPU-native visual, React, or scheduler internals
except through adapter contracts.

The first useful implementation slice should establish the publication token,
publication executor, guarded mutators, and one vertical flow that removes an
old visible publisher. Do not start by adding the full coverage oracle while
leaving existing publishers active.

Publication tokens are the capabilities that authorize visible mutation. They
must be branded/unforgeable, with constructors private to the transaction
kernel module. A commit token is not minted directly from a valid coverage
decision. It is minted only from a presentable commit, after the DOM/canvas
presentation pair is proven feasible:

```ts
type CommitDecision = {
  readonly transactionId: VisibleTransactionId;
  readonly expectedActorSetDigest: ActorManifestDigest;
  readonly proofDigest: VisibleProofDigest;
};

type PresentableCommit = Brand<{
  readonly transactionId: VisibleTransactionId;
  readonly committedFrameId: CommittedVisibleFrameId;
  readonly projectionSampleId: ProjectionSampleId;
  readonly expectedActorSetDigest: ActorManifestDigest;
  readonly proofDigest: VisibleProofDigest;
  readonly presentationPairDigest: PresentationPairDigest;
}, "PresentableCommit">;

type CommitPublicationToken = Brand<{
  readonly transactionId: VisibleTransactionId;
  readonly committedFrameId: CommittedVisibleFrameId;
  readonly projectionSampleId: ProjectionSampleId;
  readonly expectedActorSetDigest: ActorManifestDigest;
  readonly proofDigest: VisibleProofDigest;
  readonly presentationPairDigest: PresentationPairDigest;
}, "CommitPublicationToken">;

type HoldPreviousToken = Brand<{
  readonly transactionId: VisibleTransactionId;
  readonly committedFrameId: CommittedVisibleFrameId;
  readonly holdAgeMs: number;
  readonly holdAgeFrames: number;
}, "HoldPreviousToken">;

type BlockedPublicationToken = Brand<{
  readonly transactionId: VisibleTransactionId;
  readonly frozenFrameId: CommittedVisibleFrameId | ColdStartShellFrameId;
  readonly blockedReasons: readonly BlockedVisibleReason[];
}, "BlockedPublicationToken">;
```

Every publication-critical mutator must require the narrowest token that can
legally authorize its effect:

- `publishCanvasVisibleFrame(token: CommitPublicationToken, frame)`;
- `publishDomControlVisibleSnapshot(token: CommitPublicationToken, snapshot)`;
- `publishDomIslandVisibleSnapshot(token: CommitPublicationToken, snapshot)`;
- `commitBrowserVisualActors(token: CommitPublicationToken, committedTransaction)`;
- `publishHitDebugIdentity(token: CommitPublicationToken, hitDebugFrame)`;
- `clearSchedulerDebt(token: CommitPublicationToken, debtProof)`;
- `recordHoldDiagnostics(token: HoldPreviousToken, diagnostics)`;
- `recordBlockedPublication(token: BlockedPublicationToken, event)`;
- `releaseSupersededResources(token: CommitPublicationToken, releaseSet)`;
- `releaseRejectedCandidateResources(token: BlockedPublicationToken, candidateReleaseSet)`;
- `refreshPreviousFrameProtections(token: HoldPreviousToken | BlockedPublicationToken, previousFrame)`.

A token does not make a candidate valid. It proves only that the kernel chose
the transaction outcome, the expected actor set was part of the proof digest,
the presentation pair was proven for commits, and the publication executor is
applying that outcome. Type separation prevents `hold-previous` or `blocked`
from clearing scheduler debt, advancing visible DOM generations, or committing
browser visual actors.

The kernel should follow this pipeline:

1. `sample`: read the immutable live projection sample and previous committed
   visible frame.
2. `prepare`: ask actor-family adapters for retained, browser visual,
   GPU-native, hit/debug, resource, and follow-up-work candidates.
3. `prove`: run one coverage oracle over all visible nonempty actors.
4. `decide`: choose exactly one candidate outcome: `commit`, `hold-previous`, or
   `blocked`.
5. `prove presentation`: for commit decisions, prove the presentable pair:
   actor proofs are valid, resources are protected, DOM generation N is staged
   and exposable, canvas generation N is prepared and exposable, and the pair
   can expose together. Only then mint `CommitPublicationToken`.
6. `publish`: apply the selected outcome deterministically. `commit` publishes
   a new coherent visible frame; `hold-previous` republishes the previous
   coherent frame identity with updated hold diagnostics; `blocked` freezes the
   previous coherent frame and emits the blocked-visible-publication event.
   Canvas-visible frame, DOM-control/island visible snapshots, hit/debug
   identity, dataset frame ids, React semantic snapshot, protected resource
   references, and scheduler debt are updated only through this step.
7. `abort`: release only candidate-owned resources and preserve the previous
   coherent visible frame.

The immutable transaction input should include:

- live projection sample;
- previous committed visible frame;
- scheduler decision and outstanding debt;
- retained display candidate input;
- browser visual actor candidate input;
- GPU-native visual candidate input;
- hit/debug candidate input;
- protected resources and follow-up work requirements.

The three outcomes have defined semantics:

- `commit`: the transaction publishes a new coherent visible frame. Required
  actors may be exact or proven compatible-previous. Only debt satisfied by the
  committed proofs clears. Motion/projection debt may clear on a compatible
  motion commit; exact retained page, browser snapshot, live-host, active-editor,
  and content repair debt must remain queued until exact proofs satisfy it. A
  valid actor proof creates a commit decision, not commit authority. Commit
  authority exists only after the presentable DOM/canvas pair is proven and a
  `CommitPublicationToken` is minted.
- `hold-previous`: the transaction keeps the previous coherent visible frame
  visible, preserves previous hit/debug identity, keeps all publication debt
  queued, and records age/frame-count budget state. It does not count as fresh
  publication. It may update diagnostics/performance streams, but it must not
  update React semantic snapshots, DOM-control visible generations, DOM-island
  visible generations, dataset frame ids, hit/debug identity, or scheduler debt.
  Any hold diagnostics exposed to React must be throttled or out-of-band so a
  held frame cannot create a render loop. Input routes against the previous
  coherent visible frame. New projection samples and repair debt may queue, but
  candidate hit ownership, focus routing, active-editor routing, and debug
  identity cannot become visible until a later commit. Hold refreshes protection
  for previous-frame resources and does not release resources referenced by the
  previous coherent frame.
- `blocked`: the transaction cannot commit and cannot legally keep holding. It
  freezes the previous coherent visible frame, disables hit/debug advancement
  for the rejected candidate, keeps scheduler debt uncleared, emits a
  blocked-visible-publication event, and fails loudly in tests/dev guardrails.
  Input routes against the frozen previous visible frame, not the rejected
  candidate. Projection-changing input may queue samples and debt, but it cannot
  advance visible hit ownership until a later transaction commits or legally
  holds. In production, blocked freezes the previous coherent frame, records
  telemetry, and schedules repair by debt priority. If cold startup blocks with
  no previous coherent frame, the transaction publishes a first-class
  cold-start shell frame with its own identity rather than `null`, a mixed
  frame, a blank frame, or a partially interactive rejected candidate. Blocked
  may release rejected candidate resources only; it must preserve previous-frame
  resources and any staged-but-not-presented resources still needed to keep the
  previous frame or cold-start shell coherent.

## Step 3: Demote Existing Runtimes To Actor-Family Adapters

Keep specialized implementations, but remove specialized publication authority.

- `RetainedDisplayFrame` and retained display transactions prepare retained
  candidates and resource needs. They do not decide visibility by themselves.
- `GpuFlowBrowserVisualActorRuntime` prepares browser visual candidates and
  owns source/host pools. It does not publish visible DOM snapshots from
  preparation.
- `projectionRuntime` provides immutable samples, compatibility evidence, and
  held-previous age data. It does not independently publish over-budget held
  frames.
- `projectionScheduler` selects lanes and tracks debt. It does not clear debt
  until the transaction kernel reports a commit.
- `flowCommittedSurfacePublication` becomes the publication executor for a
  kernel decision, not a second decision maker.
- React stores and debug snapshots observe the committed result. They do not
  choose or advance visible publication.

This cutover should delete or move old publication decisions as each adapter is
connected. Do not keep the old decision path behind a flag or as a fallback.

The publication executor applies a kernel decision in a deterministic order:

1. protect resources needed by the previous visible frame and the candidate
   until the presentation outcome is known;
2. stage DOM-control and DOM-island visible snapshots, projection transforms,
   clipping, visibility, dataset frame ids, browser hit ownership, and
   active-editor routing without exposing them;
3. prepare canvas-visible frame identity and WebGPU submission work without
   making it visible;
4. decide whether both canvas generation N and DOM generation N can be exposed
   together;
5. on `commit`, expose DOM generation N and submit/present canvas generation N
   in the same presentation batch, then publish hit/debug identity and React
   semantic snapshot as observers of that visible frame;
6. on `hold-previous`, keep both canvas and DOM on the previous committed
   generation and record throttled/out-of-band hold diagnostics;
7. on `blocked`, keep both canvas and DOM on the frozen previous generation,
   record the blocked event, and route input against the frozen frame;
8. clear only the debt satisfied by committed proofs;
9. release only resources legal for the selected outcome.

No publication-critical browser actor state may wait for a later React
reconciliation to become visually true.

The executor must also define the browser presentation point. DOM sibling
mutations, WebGPU canvas submission, hit/debug publication, and resource
protection must be scheduled so the browser cannot visibly composite canvas
generation N with DOM-control or DOM-island generation N+1 or N-1. The software
transaction id is not enough; canvas pixels and browser DOM sibling layers must
present coherently.

The key rule is: if DOM generation N cannot be exposed for the transaction,
canvas generation N must not be visibly submitted. The transaction must hold or
block before either layer presents a mismatched generation.

Commit token minting happens after this presentation feasibility check, not
before it. A valid coverage decision with a failed presentation pair becomes
`hold-previous` or `blocked`; it cannot authorize commit-only mutators.

## Step 4: Make Browser Visual Actor Preparation Pure

Refactor `BrowserVisualActorRuntime` into two responsibilities:

- source/host management: stable browser-owned DOM sources, live host budgets,
  snapshot source pools, active pins, and focus pins;
- visible snapshot publication: the external store consumed by DOM-control,
  DOM-island, and snapshot layers.

`prepareBrowserVisualActors(transactionInput)` should return an immutable
candidate with actor proofs, but should not update the visible snapshot or emit.

`commitBrowserVisualActors(committedTransaction)` should be the only operation
that updates the visible browser visual snapshot. It should run after the
committed surface frame is known publishable and after the canvas/projection
transaction is accepted.

`abortBrowserVisualActors(candidate)` should release only resources allocated
for that candidate and should leave the visible browser visual snapshot
unchanged.

Preparation may allocate, mount, measure, or park browser hosts only if those
mutations are invisible, non-interactive, not hit-owning, not exposed through
committed dataset frame ids, and not observable as the current visible
generation. Host preparation cannot become a hidden publisher.

Actor proofs should be first-class and split into two axes:

Visual proof:

- `exact-live-host`: visible actor is backed by a mounted live browser host;
- `same-live-host-compatible-projection`: an already mounted live host remains
  the same logical actor with the same actor identity and the same DOM node or
  browser editing host identity, and is projected, clipped, and hit-mapped
  through the new sample. It cannot be satisfied by remounting a visually
  equivalent editor for the same actor id;
- `exact-snapshot`: visible actor is backed by an exact browser-rendered
  snapshot artifact;
- `compatible-previous`: visible actor is backed by a previous committed actor
  whose generation and projection are proven compatible;
- `blocked`: visible actor has no legal representation for this transaction.

Interaction proof:

- `inactive-visual-only`: actor only needs passive pixels for this transaction;
- `live-hit-compatible`: actor can route pointer hit ownership correctly;
- `live-focusable`: actor can receive focus and native browser events;
- `active-editor-live`: actor supports active editing, caret, selection, IME,
  composition, typing, native event continuity, and focus continuity for this
  transaction;
- `blocked`: actor lacks required interaction representation.

For example, passive readable text can publish with visual `exact-snapshot` and
interaction `inactive-visual-only`. An active text editor requires visual
`exact-live-host` or `same-live-host-compatible-projection`, plus interaction
`active-editor-live`.

Do not represent compatible previous coverage as a blocked readiness state and
then re-derive compatibility elsewhere. The actor proof should be owned once and
consumed by committed surface publishability.

## Step 5: Make Compatible Previous A First-Class Proof

Compatible previous coverage is required for responsive motion and retained
scroll projection. It must not become an implicit fallback.

Every compatible previous proof must include:

- actor id and owner family;
- previous actor generation and requested actor generation;
- previous committed frame id;
- requested live projection sample id;
- clip-chain and retained-scroll compatibility;
- hit mapping compatibility;
- protected resource ids;
- proof age in frames and milliseconds;
- budget state.

Motion and retained-scroll frames may commit with compatible previous coverage
only when the transaction proves compatibility and remains inside budget. Once
the budget is exceeded, the next transaction must force repair or block. It may
not publish another active stream of stale compatible previous frames.

## Step 6: Move React And External Store Publication Downstream

Remove render-phase mutation from committed-surface setup. Startup frame and
committed-source updates must be initialized without emitting during React
render, or moved to an effect/layout-effect path that cannot notify
`useSyncExternalStore` subscribers while `GpuFlow` is rendering.

Moving updates to an effect is necessary but not sufficient. React semantic
publication must consume the transaction kernel's committed result. It must not
prepare, decide, or partially publish visible state.

After this step, a test that captures console errors during Settings transition
must not see:

`Cannot update a component while rendering a different component`

This is a visible runtime health requirement, not just a code-style preference.

## Step 7: Enforce Held-Previous Budgets In The Kernel

Keep held-previous projection, but make its budget authoritative inside the
transaction decision.

Within budget:

- hold the previous coherent visible frame;
- keep content/maintenance debt queued;
- record age and frame count for diagnostics.

After budget:

- force the next selected lane to repair the missing retained/projection
  coverage, or enter `blocked`;
- do not continue publishing an active stream of over-budget held-previous
  frames;
- do not clear publication debt until a coherent visible frame actually
  commits.

The user-observable behavior after this change should be either visible
progress within budget or a diagnosed stalled state, never multi-second silent
staleness.

## Step 8: Preserve Motion Fast-Path Cost Bounds

The transaction kernel must preserve the motion-first architecture. Motion
transactions are allowed to be authoritative, but they must not become content
transactions in disguise.

Motion transactions should prove compatibility from:

- the previous committed actor manifest;
- the immutable live projection sample;
- changed retained-scroll surface ids and deltas;
- clip-chain revisions;
- protected resource identities;
- active/live host horizon state.

Motion transactions must not:

- resample retained runtime frames;
- resolve retained display transactions;
- rebuild full actor families;
- create committed content frames;
- publish React semantic state as a prerequisite for visibility;
- upload passive textures;
- walk the full Settings scene.

Settings remains the benchmark for this constraint, but no Settings-specific
shortcut is allowed.

The coverage oracle itself must be incremental. Motion-frame proof must be
computed from committed manifests, actor-set digests, changed projection
samples, clip-chain revisions, and changed retained-scroll surfaces. Pixel
evidence and full actor coverage reports may be sampled or recorded
diagnostically, but they must not become per-RAF hot-path work.

## Step 9: Unify The Coverage Oracle

Replace separate descriptor-count, DOM-control-readiness, retained-display, and
browser-evidence interpretations with one actor coverage oracle per visible
transaction.

The expected visible actor set must be derived from the committed/requested
actor manifest, projection sample, clip-chain revision, and scene/runtime
inputs. An actor-family adapter cannot make a required actor disappear by
reporting it as empty, clipped, outside the viewport, or not required unless the
oracle can independently prove that classification.

The oracle produces an expected actor set digest and a proof digest. Commit
tokens carry both so publication proves what was required and what was
satisfied.

Canonical actor identity must be owner-defined and stable across representation
changes:

```text
canonicalActorId = ownerFamily + surfaceId + row/control identity + representation role
```

The oracle must classify generation changes explicitly:

- same actor, new content generation;
- same actor, new projection generation;
- same actor, representation change;
- new actor;
- removed actor.

Compatible previous proofs require the same canonical actor id plus a generation
classification that allows compatibility. A stable control with new content
should not be over-blocked as a new actor, and an unrelated replacement must not
inherit compatible previous coverage merely because it occupies the same visual
region.

For every visible nonempty actor, the oracle must answer:

- actor id;
- owner family;
- content generation;
- projection generation/sample;
- required visual representation;
- actual visual proof;
- required interaction representation;
- actual interaction proof;
- whether each proof is exact, compatible previous, inactive visual-only, or
  blocked;
- which publication debt remains after the proof;
- sampled visual evidence status where pixels are available.

Descriptor counts, mounted-host counts, and visible-rect counts remain useful
diagnostics, but none of them should make a frame publishable by themselves.

## Step 10: Treat Browser Snapshots As Versioned Resources

Model browser-rendered snapshots like retained texture pages:

- immutable resource id;
- actor id and content generation;
- source layout size and device pixel ratio;
- projection/scroll sample compatibility key;
- paint/capture timestamp;
- protected-resource ownership while referenced by a committed frame;
- explicit release after no committed or prepared transaction needs it.

This mirrors the `captureElementImage` / `ElementImage` idea from WICG
HTML-in-Canvas: the snapshot is an artifact with identity and lifetime, not an
implicit side effect of mounted DOM.

## Step 11: Define Cold-Start Shell Frames

Cold-start blocked publication must not use a `null` frozen frame id. When no
previous coherent visible frame exists, the kernel publishes a first-class shell
frame with a `ColdStartShellFrameId`.

Shell frame semantics:

- visual: loading/error shell;
- hit/debug: shell-owned, not candidate-owned;
- input: disabled or shell-only;
- scheduler debt: uncleared;
- resources: no previous-frame release path;
- recording: `blocked-visible-publication` with cold-start reason and shell
  frame id.

The shell is a real visible frame for publication accounting. It prevents
downstream code from treating the rejected candidate as partially publishable
just because no previous committed frame exists.

## Step 12: Tighten Chrome Recording Evidence

Add app-state/performance events that make the new transaction visible in
recordings:

- visible transaction id, input sample id, previous committed frame id, and
  outcome;
- presentable commit digest and presentation pair digest for commit outcomes;
- candidate actor proof counts by family and proof state;
- remaining publication debt by family and debt kind after the decision;
- blocked actor samples with actor id, owner, surface id, row/control id, and
  missing resource reason;
- held-previous age/frame count with budget and selected repair lane;
- browser visual prepare/commit/abort ids;
- pixel evidence for live hosts and snapshot-backed actors, not only mounted
  live hosts;
- starvation/blocked-visible-publication events captured by the Chrome repro
  recorder.
- cold-start shell frame id and reason when startup blocks without a previous
  coherent frame.

The recording should make it obvious whether a failure is a missing browser
snapshot, missing retained page coverage, stale compatible-previous proof, or
render-loop starvation.

## Step 13: Delete Old Paths During Cutover

Remove old publication paths as the kernel absorbs each authority. Do not wait
until the end and call this cleanup:

- any browser visual prepare path that mutates visible state;
- any readiness state that hides a required browser visual actor as
  `not-required`;
- any committed-surface publication path that can publish without a kernel
  decision;
- any publication-critical mutator that does not require a
  `CommitPublicationToken`, `HoldPreviousToken`, or `BlockedPublicationToken`;
- any commit-token constructor reachable before presentation pair feasibility is
  proven;
- any blocked path that propagates `null` instead of a first-class
  `ColdStartShellFrameId` when no previous coherent frame exists;
- any exported raw visible store setter, raw scheduler debt setter, raw
  external-store emitter, or raw resource releaser reachable from actor-family
  adapters;
- any DOM-control, DOM-island, or React external-store path that advances
  visible generation outside kernel publication;
- any scheduler path that clears debt after `hold-previous` or `blocked`;
- any scheduler path that clears exact-content, browser snapshot, live-host,
  active-editor, or retained-page repair debt from a compatible-previous
  commit;
- any blocked path that releases previous-frame resources or
  staged-but-not-presented resources needed to preserve the frozen frame;
- any host-preparation path that mounts visible, interactive, hit-owning, or
  committed-frame-addressable DOM outside publication;
- any recorder-specific visual policy branch;
- any retained/projection path that keeps publishing over-budget held-previous
  frames;
- any debug assertion that treats projected descriptor counts as coverage proof.

## Verification

Targeted verification after each implementation slice:

- `pnpm -C frontend exec vitest run frontend/src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts`
- `pnpm -C frontend exec vitest run frontend/src/gpuFlow/GpuFlow/flowCommittedSurfacePublication.test.ts`
- `pnpm -C frontend exec vitest run frontend/src/gpuFlow/committedSurfaceFrame.test.ts`
- `pnpm -C frontend exec vitest run frontend/src/gpuFlow/committedSurfaceRuntime.test.ts`
- targeted Playwright specs under `frontend/tests/e2e/settings/`
- the new failing observed-behavior specs from Step 1
- blocked-path fault-injection tests from Step 1
- no-hidden-publisher token guard tests from Step 1
- active-editor-during-motion tests from Step 1
- static boundary checks that reject direct raw publication setter, emitter,
  resource release, or scheduler debt mutation usage outside publication modules
- `./scripts/record-chrome-repro.sh` for the Settings flow, then inspect the
  latest recording for transaction evidence and absence of console errors

Before finishing the refactor, run:

- `./scripts/quality/check.sh`

For visual/UI changes, run CDP visual verification on Settings and report it in
the final response.

## Acceptance Criteria

- The Step 1 tests fail before the refactor and pass after it.
- Every RAF has at most one visible-frame outcome, and all visible publication
  state is derived from that outcome.
- There is no code path that can mutate visible canvas frame identity,
  DOM-control visible snapshot, DOM-island visible snapshot, browser actor
  dataset frame id, hit/debug identity, protected resource ownership, or
  scheduler debt without a transaction id from the single publication kernel.
- Every publication-critical mutator requires an outcome-specific publication
  token. Hold/blocked tokens cannot type-check at commit-only mutators.
- Token constructors are private to the transaction kernel, and actor-family
  adapters cannot import raw visible setters, raw emitters, raw resource
  releasers, or raw scheduler debt setters.
- Browser presentation is coherent: canvas submission and DOM sibling layer
  publication cannot present different committed generations to the user.
- Canvas generation N is not visibly submitted unless DOM generation N can also
  be exposed in the same presentation decision.
- `CommitPublicationToken` is minted only from a presentable commit that carries
  the presentation pair digest.
- Settings transition produces no React render-phase warning.
- Retained scroll and immediate zoom either show visible progress within the
  held previous budget or enter the defined blocked state; they never silently
  publish stale multi-second held frames.
- Compatible previous coverage is explicit and includes generation, projection,
  clip/hit compatibility, protected resource identity, and age.
- Commits clear only debt satisfied by their proofs. Compatible-previous motion
  commits do not clear exact-content, browser snapshot, live-host,
  active-editor, or retained-page repair debt.
- Visual proof and interaction proof are separate, so snapshot coverage cannot
  satisfy active/focusable/browser-editing requirements.
- Active editor motion uses `same-live-host-compatible-projection` or
  `exact-live-host` visual proof with `active-editor-live` interaction proof.
- `same-live-host-compatible-projection` requires the same DOM node or browser
  editing host identity; remounting a visually equivalent editor is not enough.
- `hold-previous` may emit diagnostics, but it does not churn React semantic
  snapshots, DOM visible generations, dataset frame ids, hit/debug identity, or
  scheduler debt.
- Hold and blocked input route against the previous/frozen visible frame.
- Production blocked behavior freezes the previous coherent frame, records
  telemetry, schedules repair by debt priority, and uses the defined
  loading/error shell when no coherent previous frame exists.
- Cold-start blocked publication uses a first-class shell frame id, not `null`.
- The oracle is incremental on motion frames; pixel evidence and full coverage
  reports are diagnostic sampling, not per-RAF hot-path work.
- Required visible actors are derived by the oracle from manifests, projection,
  clip-chain, and scene/runtime inputs; adapters cannot hide required actors by
  redefining visibility or emptiness.
- Canonical actor identity and generation migration rules prevent both
  over-blocking stable actors and under-blocking unrelated replacements.
- Blocked transactions release rejected candidate resources only and preserve
  previous-frame resources.
- Motion transactions prove compatibility from committed manifests and deltas
  without walking the full Settings scene or running content publication work.
- Publication-critical browser actor projection, visibility, clipping, frame
  ids, hit ownership, and resource protection are true immediately after the
  publication executor runs, without waiting for React reconciliation.
- Browser-owned text controls remain readable, clickable, focusable, and
  editable after viewport and retained-scroll projection.
- A visible committed frame has one actor coverage report covering retained
  pages, DOM controls, DOM islands, HTML texture actors, GPU-native visuals,
  hit state, and debug state.
- Chrome recording mode does not change visible publication policy.
- The old specialized publication authorities are deleted or demoted to
  candidate preparers. They are not kept behind flags or transitional branches.
