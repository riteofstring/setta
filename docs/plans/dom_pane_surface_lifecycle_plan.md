# DOM Pane Surface Lifecycle Plan

## Goal

Make Niri-style pane movement smooth for DOM-backed panes first, using the
workspace system that already exists.

This plan deliberately keeps chat, settings, workflow details, and lightweight
empty-frame panes as real DOM. The work is to make the pane manager smarter
about movement, visibility, lifecycle, and cached visual fallbacks. It is not a
plan to build a whole-app GPU compositor.

## Scope

Included DOM-backed surface kinds:

- `chat-dom`
- `settings-dom`
- `workflow-node-details`
- `workflow-settings`
- `empty-frame`
- diagnostic DOM fixtures such as `fake-heavy-dom` and `fake-long-chat`

Deferred until after DOM panes are stable:

- product terminal panes
- workflow graph canvas/Pixi/WebGPU behavior
- git graph renderer behavior
- Electron browser panes
- offscreen browser textures
- any shared GPU compositor or custom input router

Browser panes should be handled last because they have the hardest input,
focus, IME, accessibility, native-view, and context-menu tradeoffs.

## Existing Starting Point

The repo already has the right integration shape:

- `WorkspaceLayoutStore` owns focus, target scroll, overview progress, and
  layout revision.
- `FrameScheduler` drives animation frames, endpoint-frame caching for overview
  transitions, runtime policy application, and metrics.
- `PresentationEngine` owns host assignment, transform/box writes, pane chrome,
  and surface syncing.
- `SurfaceRegistry` owns `SurfaceAdapter` instances and switches between live,
  snapshot, throttled, hidden, and destroyed runtime states.
- `PaneRuntimePolicy` already has per-kind budgets and movement/overview
  degradation flags.
- `ChatTranscript` already virtualizes long transcripts with `react-virtuoso`.

The main gap is not lack of abstraction. The main gap is that DOM cached visual
frames are not treated as continuously maintained pane state. The current
snapshot path captures DOM from the host during adapter switching. That means a
runtime-policy change can still introduce capture work at the same time the user
is entering movement or overview.

## Principles

1. Hot DOM panes stay live DOM.
2. Focused DOM panes stay interactive.
3. DOM pane movement should write transforms, opacity, and z-index only. It
   should not mount React roots, unmount React roots, clone DOM, measure
   expensive subtree layout, or rebuild pane content.
4. Snapshot capture must not be introduced into the active movement path.
5. Cached visual frames are a lifecycle asset of the surface, not an emergency
   artifact produced by navigation.
6. Runtime policy should degrade expensive unfocused DOM panes only when a
   cached fallback is known to exist or when a static placeholder is explicitly
   acceptable.
7. Verification must use production Electron/main/preload/renderer paths with
   temporary app data for user-visible workspace/chat behavior.

## Non-Goals

- Do not render normal React DOM panes into WebGPU/Pixi/Three.
- Do not add a universal pane texture interface for v1.
- Do not replace `react-virtuoso` for chat transcript virtualization unless
  measurement proves it is the bottleneck.
- Do not introduce browser-pane offscreen texture input routing in this phase.
- Do not add compatibility shims for older pane schemas or stale runtime states.

## Phase 0: Baseline And Guardrails

Create a DOM-pane performance baseline before changing runtime policy.

Tasks:

- Add or extend a production Electron performance workflow that opens a real
  workspace with multiple DOM-heavy panes:
  - chat pane with a large transcript fixture
  - settings pane
  - workflow node details pane
  - workflow settings pane
  - diagnostic heavy DOM pane if needed for repeatable stress
- Measure normal left/right focus navigation, overview enter/exit, and active
  window resize.
- Record before results under
  `docs/reports/performance/dom-pane-surface-lifecycle.md`.
- Add metrics that make the forbidden work visible:
  - React commits during movement
  - live React root mounts during movement
  - React root unmounts during movement
  - DOM snapshot captures during movement
  - surface adapter switches during movement
  - p95/p99/max frame time
  - long task count

Success criteria:

- The baseline is repeatable from a single Electron workflow command.
- The report captures enough counters to tell whether a future improvement is
  real or just moving work out of sight.

## Phase 1: Make DOM Snapshot Capture Explicit And Scheduled

Move DOM snapshot capture away from adapter switching.

Tasks:

- Introduce a DOM snapshot/cache owner inside the surface layer. It can start as
  a DOM-clone cache, matching the current `SnapshotSurfaceAdapter` mechanism.
- Add explicit methods for:
  - `refreshSnapshot(reason)`
  - `hasUsableSnapshot()`
  - `invalidateSnapshot(reason)`
- Trigger snapshot refresh only from safe moments:
  - after a pane first settles live
  - after resize settles
  - after overview transition settles
  - after a known DOM content update when the pane is idle
- Prohibit snapshot capture when `movementPhase === "moving"` or
  `resizePhase === "active"`.
- Add tests that fail if snapshot capture happens during active movement.

Success criteria:

- Switching a DOM pane from live to snapshot uses an existing cached frame or a
  static fallback.
- No DOM clone/capture work occurs during navigation frames.

## Phase 2: Add DOM Hot/Warm/Cold Policy On Top Of Existing Runtime States

Keep the public runtime states, but make DOM decisions based on pane proximity.

Suggested mapping:

| DOM priority | Runtime behavior |
|---|---|
| Hot | `live`; focused and visible panes stay interactive. |
| Warm | `live` or `snapshot` depending on budget and cached-frame readiness. |
| Cold | `snapshot` or `hidden`; keep logical state outside the rendered surface. |

Tasks:

- Compute DOM priority from existing render data:
  - focused pane is hot
  - visible panes are hot
  - panes one navigation step away are warm
  - panes inside render overscan are warm
  - everything else is cold/hidden
- Keep this policy in `PaneRuntimePolicy` or a small helper owned by the
  workspace-layout domain.
- Do not add a second independent lifecycle model next to
  `PaneRuntimeState`.
- In workspace mode, start conservatively:
  - focused `chat-dom` remains live
  - visible `chat-dom` remains live unless a stress measurement proves it must
    degrade
  - unfocused heavy diagnostic DOM can degrade earlier
- Prefer explicit per-surface-kind decisions over broad heuristics.

Success criteria:

- DOM pane runtime states are predictable from focus, visibility, proximity,
  surface kind, movement phase, and cache readiness.
- The policy is exhaustively typed and covered by narrow tests.

## Phase 3: Preserve React DOM Roots Across Movement

Avoid React mount/unmount churn in the movement path.

Tasks:

- Audit `ReactDomSurfaceAdapter` mount/unmount behavior during focus movement,
  overview transitions, and host reassignment.
- Prefer retaining live DOM roots for hot/warm DOM panes when a host remains
  available.
- Avoid switching adapters during movement unless the target adapter is already
  mounted or the live host is missing.
- Add counters to `WorkspaceMetricsCollector` for DOM root mount/unmount during
  movement.
- Extend the performance workflow to fail if DOM root churn appears during
  navigation.

Success criteria:

- Left/right pane navigation does not cause React root mount/unmount churn for
  hot DOM panes.
- Overview transition does not cause a burst of DOM root churn.

## Phase 4: Chat-Specific DOM Hardening

Keep chat live when it is the focused pane and make its internal scrolling cheap.

Tasks:

- Keep `ChatTranscript` virtualization as the primary long-transcript strategy.
- Add a large-chat production Electron fixture if one does not already exist.
- Verify:
  - opening workspace with a large selected chat
  - streaming assistant output while focused
  - queueing while active
  - scrolling transcript manually
  - switching focus away and back
  - overview enter/exit while chat exists
- Confirm the transcript row count remains bounded during large fixtures.
- Check that pinned-to-bottom behavior does not trigger excessive layout or
  React commits during pane movement.

Success criteria:

- A large chat pane stays interactive when hot.
- Switching away and back preserves scroll state and selected conversation
  behavior.
- No chat workflow regression is proven through production Electron workflow
  tests.

## Phase 5: Settled-State Cleanup And Memory Budgeting

Once DOM snapshot timing and lifecycle are stable, make memory use explicit.

Tasks:

- Track DOM snapshot count and approximate retained node count.
- Add a cap for DOM cached frames separately from browser/canvas/terminal
  budgets.
- Evict cold DOM snapshots deterministically.
- Prefer static fallback for cheap panes where a cached visual frame is not
  worth retaining.
- Document memory tradeoffs in the performance report.

Success criteria:

- DOM snapshot retention is bounded.
- Cold pane cache eviction is deterministic and covered by tests.

## Verification Strategy

Focused checks during implementation:

- `pnpm -C desktop test` for renderer unit coverage around runtime policy,
  surface registry, presentation engine, and chat transcript behavior.
- Targeted Electron workflows for pane focus, overview zoom, resize, and chat
  behavior.

Required broader checks before merging source changes:

- `./scripts/format.sh`
- `./check_quality.sh --all`

For changes touching chat transcript behavior, chat state, or production chat
workflow behavior, also run deterministic Electron chat workflow tests through
production main/preload/renderer/HTTP/store paths. If live Codex E2E tests are
required by the touched behavior and local ChatGPT auth is unavailable, record
the skip explicitly and do not treat it as proof of provider integration.

## Expected Difficulty

Phase 0 and Phase 1 are medium difficulty and should be done first. They give
the project guardrails against repeating the previous snapshot-transition hitch.

Phase 2 and Phase 3 are medium-high difficulty because they touch the
presentation/surface boundary and can regress focus, pane reuse, or visual
continuity.

Phase 4 is high-risk only where chat workflow semantics are touched. The
transcript virtualization itself is already in the right shape.

Phase 5 is medium difficulty after the lifecycle model is stable.

## Expected Outcome

After this plan, DOM-backed panes should move like managed surfaces without
being turned into GPU textures:

```txt
live DOM for hot panes
+ prewarmed DOM snapshot/static fallback for warm and cold panes
+ transform-only movement
+ no snapshot capture during navigation
+ bounded DOM cache retention
+ production Electron performance evidence
```

This creates the right foundation before dealing with terminal, canvas, and
browser panes. Browser panes remain intentionally last.
