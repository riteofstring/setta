# Phase 1 Gate Audit

## Result

All repository-actionable Phase 1 work is complete after the restarted phase audit and correction
commits `75a65c6d8689c8d2a92975c0ffb882b481031228` and
`5c9ab6a2ad5d5c12d9256beada8dc4ba0822a8b3`. No Phase 2 work is included.
Interactive in-app CDP review remains unavailable and stays an external release gate; it does not
reopen repository implementation work or authorize seeking a GUI, credentials, services, or remote
access.

The audit expands the requested minimum range
`45a952ea326507532821581d5123c856a79125fd..8c523adedeaa7617e7094844a74538ad02c97534`
across the mid-phase restart to the complete Phase 1 implementation range
`bf8908876e770b69c2f1b5bffa751feeabeec1f4^..5c9ab6a2ad5d5c12d9256beada8dc4ba0822a8b3`.
That range contains 53 changed files and 17 implementation, audit, and plan commits. It includes the
initial serializable document, every Phase 1 implementation commit, the mid-phase restarts, the core
decomposition, and all audit corrections. It should be read with the Phase 0 gate audit,
upstream-adapter proof, interaction matrices, package API report, and browser baselines.

The correction batch closes every actionable finding from one static pass: production grid zoom
uses the documented public XYFlow viewport hook rather than a direct store subscription; built-in
fit targets only the root sections actually projected in Phase 1; controlled hosts that reject a
gesture completion restore the unchanged canonical viewport; workspace accessible names reject
blank runtime values; arbitrary empty-state markup has valid, interactive, gesture-isolated
containment; navigation actions cannot run while the playground canvas is detached; and the
retained adapter-proof drag workflow now waits for measured initial fit and settles nested
auto-scroll after pointer ownership begins.

A later supervisor-required architecture correction extracts the complete toolbar into a focused
internal module and reduces the production canvas adapter from 996 to 549 lines, restoring
useful Phase 2 headroom. Toolbar zoom now receives live bounds from the adapter-owned geometry
service instead of querying the ambient global document, preserving correct ownership for multiple
documents, iframes, and detached windows. The rendered native controls, accessible names and
states, roving focus, tooltips, ordering, and public controller boundary remain unchanged.

The final restarted audit closes the remaining strictness and interaction gaps as one coherent
batch. Section maps and runtime arrays can no longer hide non-enumerable, symbol, sparse, or extra
fields from validation; deletion preserves legal IDs such as `__proto__`; null and unknown runtime
options fail specifically; fit and controller arguments validate before geometry or publication;
imperative viewport changes honor live configured zoom bounds; and caller-provided parent maps and
navigation directions cannot hang or silently guess. React ownership treats explicit null as an
invalid document and validates every supplied change handler. A controlled host that rejects
toolbar proposals no longer leaves a pending zoom target to compound later commands. Keyboard
focus remains visibly outlined inside clipped section nodes, and logical centering is correct for
RTL empty and viewport overlays.

The current restarted audit closes the assumptions affected by the later core decomposition and
the complete Phase 1 surface. Strict document, option, preference, toolbar, and controller
validation now rejects accessor-backed fields and array entries without evaluating them; viewport
arguments retain their full descriptor shape until canonical validation completes. Controlled
hosts that reject measured navigation, and later viewport synchronizations that supersede an
earlier request, settle the pending helper without moving stale DOM focus. The controller becomes
available only after the upstream viewport initializes. Initial frame registration and later
measurement passes coalesce into one shared canvas-rectangle read, while only a small toolbar
observer subscribes to transient viewport updates. The minimap toggle always references a mounted
target, and transformed host overlays size against their workspace container rather than the
ambient browser viewport.

## Gate-by-gate record

| Gate                                      | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Serializable document                     | Pass. Versioned recursive documents, canonical root/child placement, parent derivation, deterministic traversal, JSON-value constraints, strict parsing, arbitrary-depth round trips, enumerable string data-property ownership, dense data-property arrays, prototype-mutator IDs, and specific malformed-state failures remain framework-neutral in focused core modules.                                                                                                                                        |
| Controlled and uncontrolled ownership     | Pass. The modes remain mutually exclusive and stable, explicit null documents fail validation, and every supplied change handler is validated. Controlled proposals mutate no package-owned canonical state; rejected gestures, toolbar commands, and measured navigation reconcile to the unchanged host document without an unresolved promise or stale focus.                                                                                                                                                   |
| Public controller and capability boundary | Pass. One stable package controller validates intact arguments before publication, routes commands through canonical validation, enforces live configured zoom bounds, emits compact reasons once, suppresses no-ops, rejects layout/structure/presentation edits specifically, and keeps viewport navigation available in read-only mode.                                                                                                                                                                         |
| Public package closure                    | Pass. Declared entrypoints expose only package-owned contracts. The generated declaration closure contains no XYFlow node, edge, store, or change-event types and consumers require no source alias or internal path.                                                                                                                                                                                                                                                                                              |
| XYFlow adapter boundary                   | Pass. Production uses documented public components, helpers, `useReactFlow`, and `useViewport`; it no longer subscribes directly to the upstream store. Upstream node and viewport types remain adapter-local.                                                                                                                                                                                                                                                                                                     |
| Root projection and recursive input       | Pass. Phase 1 renders canonical spatial roots without mutating the recursive document. Toolbar fit uses that same visible root set, so valid but not-yet-rendered descendants cannot be sent to the measurement gate. Recursive frame rendering remains Phase 3 work.                                                                                                                                                                                                                                              |
| Viewport lifecycle                        | Pass. Live transforms remain transient, one accepted gesture publishes at completion, cancellation restores its baseline, programmatic synchronization stays outside publication, rejected controlled proposals roll back visually, and rapid or rejected toolbar commands remain based on the canonical viewport.                                                                                                                                                                                                 |
| Gesture policy and host arbitration       | Pass. Runtime pan/zoom modes, direction, speed, bounds, dense activation-key and pointer-button lists, pinch, double click, and independent host pan/wheel suppression remain validated and covered across pointer, touch, keyboard, and wheel paths.                                                                                                                                                                                                                                                              |
| Geometry and navigation                   | Pass. One measurement registry owns visible-frame registration, coalesced initial/resize/scroll/window/projection updates with one shared canvas read per pass, conversions, readiness-aware bounds, validated fit policy, focus/fit, supersession settlement, bounded descendant checks, and deterministic validated next/previous traversal. Focus prevents browser scrolling, has a visible in-node outline, and works at 200% page scale.                                                                      |
| Grid, snapping, and appearance            | Pass. Dot/line/cross grids use the public viewport zoom, remain aligned at negative coordinates and non-unit zoom, reject malformed runtime preference values and spacing arrays, and stay independent from snapping. Scoped light/dark/system tokens retain automated gamut, APCA, and WCAG checks without mutating global appearance.                                                                                                                                                                            |
| Toolbar, extensions, and minimap          | Pass. The complete toolbar has focused internal ownership, confines transient viewport subscription to a null-rendering observer, and receives canvas bounds from adapter geometry without global document lookup. Native controls retain strict dense registration, deterministic grouping, pressed/disabled states, roving focus, tooltips, coarse targets, reduced motion, RTL and narrow reflow, controlled proposals, controller-only host callbacks, cleanup, and a persistent valid minimap control target. |
| Empty state and accessible naming         | Pass. A non-empty accessible name is guaranteed at runtime. Empty-state `ReactNode` content is no longer forced into paragraph content, and its interactive surface receives pointer input while suppressing canvas pan/wheel ownership.                                                                                                                                                                                                                                                                           |
| Teardown and remount                      | Pass. Detachment cancels transient publication and releases measurement targets, observers, listeners, frames, and subscriptions. Navigation controls that require a live controller disable while detached, and remount restores the accepted viewport.                                                                                                                                                                                                                                                           |
| Retained adapter-proof gate               | Pass. The drag workflow now observes the proof's explicit initial-fit readiness gate and normalizes nested auto-scroll after pointer activation, preserving the requirement that final geometry match the displayed preview before one command can commit.                                                                                                                                                                                                                                                         |
| Packed unrelated consumer                 | Pass. The final tarball installed into a temporary unrelated fixture under the empty lifecycle-script allowlist and its TypeScript/Vite build completed successfully.                                                                                                                                                                                                                                                                                                                                              |

## External release gate

Interactive CDP visual review was attempted once earlier on 2026-08-08 and reported no connected
browser surface. It was not retried during this phase audit. Repository Playwright remains the
available visual and interaction evidence; a final audit environment with an available browser
must record the interactive review before release.

CDP visual check: not run (no connected browser surface; recorded external release gate).

## Verification boundary

The correction commits are followed by the complete authoritative Phase 1 matrix. The first broad
attempt stopped before tests and builds at the controller's complexity threshold; the focused
refactor in `5c9ab6a2a` passed the single-file lint workflow before the one final broad rerun:

- Exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 `quality:all` passed for 139
  project files: repository and dependency policy, formatting, lint, strict types, dead-code
  analysis, complexity and file-length limits, 211 unit tests, six boundary tests, plan-loop
  automation, package/playground builds, tarball allowlisting including the runtime-validation
  helper, and declaration-closure API report generation.
- The final full Chromium Playwright matrix passed 21 of 21 workflows, including rejected
  controlled toolbar and measured-focus proposals, canonical viewport restoration, strict runtime
  gesture behavior, lifecycle teardown, Axe, 200% page scale, 320-pixel reflow, reduced motion, RTL
  positioning, and every visual baseline. The existing keyboard-focus baseline remains the
  original-resolution evidence for the focus outline inside the clipped section frame.
- `consumer:check` installed and built the final packed artifact in a temporary unrelated fixture.
- No manifest, lockfile, patch, exception, or dependency-policy input changed. The already-green
  registry-backed `supply-chain:check` therefore postdates the last dependency change and was not
  duplicated.
