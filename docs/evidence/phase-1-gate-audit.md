# Phase 1 Gate Audit

## Result

All repository-actionable Phase 1 work is complete after the restarted phase audit and final
correction commit `0564ab8f1b7e09273ace1f51d70f247139d75953`. No Phase 2 work is included.
Interactive in-app CDP review remains unavailable and stays an external release gate; it does not
reopen repository implementation work or authorize seeking a GUI, credentials, services, or remote
access.

The audit expands the requested minimum range
`f5d3577f20c1d35c0ee05430e12c2f59d35f580b..4e159a0851b19d8c8896577eadc57bb8979209d1`
across the mid-phase restart to the complete Phase 1 implementation range
`bf8908876e770b69c2f1b5bffa751feeabeec1f4^..0564ab8f1b7e09273ace1f51d70f247139d75953`.
That range contains 48 changed files and includes the initial serializable document, every Phase 1
implementation commit, both earlier audit corrections, and the final correction. It should be read
with the Phase 0 gate audit, upstream-adapter proof, interaction matrices, package API report, and
browser baselines.

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

## Gate-by-gate record

| Gate                                      | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Serializable document                     | Pass. Versioned recursive documents, canonical root/child placement, parent derivation, deterministic traversal, JSON-value constraints, strict parsing, arbitrary-depth round trips, enumerable-string section-map ownership, dense arrays, prototype-mutator IDs, and specific malformed-state failures remain framework-neutral in `core.ts` and focused internal helpers.                                                                                                                                |
| Controlled and uncontrolled ownership     | Pass. The modes remain mutually exclusive and stable, explicit null documents fail validation, and every supplied change handler is validated. Controlled proposals mutate no package-owned canonical state; rejected gestures and toolbar commands re-synchronize to or remain based on the unchanged host document.                                                                                                                                                                                        |
| Public controller and capability boundary | Pass. One stable package controller validates arguments before publication, routes commands through canonical validation, enforces live configured zoom bounds, emits compact reasons once, suppresses no-ops, rejects layout/structure/presentation edits specifically, and keeps viewport navigation available in read-only mode.                                                                                                                                                                          |
| Public package closure                    | Pass. Declared entrypoints expose only package-owned contracts. The generated declaration closure contains no XYFlow node, edge, store, or change-event types and consumers require no source alias or internal path.                                                                                                                                                                                                                                                                                        |
| XYFlow adapter boundary                   | Pass. Production uses documented public components, helpers, `useReactFlow`, and `useViewport`; it no longer subscribes directly to the upstream store. Upstream node and viewport types remain adapter-local.                                                                                                                                                                                                                                                                                               |
| Root projection and recursive input       | Pass. Phase 1 renders canonical spatial roots without mutating the recursive document. Toolbar fit uses that same visible root set, so valid but not-yet-rendered descendants cannot be sent to the measurement gate. Recursive frame rendering remains Phase 3 work.                                                                                                                                                                                                                                        |
| Viewport lifecycle                        | Pass. Live transforms remain transient, one accepted gesture publishes at completion, cancellation restores its baseline, programmatic synchronization stays outside publication, rejected controlled proposals roll back visually, and rapid or rejected toolbar commands remain based on the canonical viewport.                                                                                                                                                                                           |
| Gesture policy and host arbitration       | Pass. Runtime pan/zoom modes, direction, speed, bounds, dense activation-key and pointer-button lists, pinch, double click, and independent host pan/wheel suppression remain validated and covered across pointer, touch, keyboard, and wheel paths.                                                                                                                                                                                                                                                        |
| Geometry and navigation                   | Pass. One measurement registry owns visible-frame registration, coalesced resize/scroll/window/projection updates, conversions, readiness-aware bounds, validated fit policy, focus/fit, bounded descendant checks, and deterministic validated next/previous traversal. Focus prevents browser scrolling, has a visible in-node outline, and works at 200% page scale.                                                                                                                                      |
| Grid, snapping, and appearance            | Pass. Dot/line/cross grids use the public viewport zoom, remain aligned at negative coordinates and non-unit zoom, reject malformed runtime preference values and spacing arrays, and stay independent from snapping. Scoped light/dark/system tokens retain automated gamut, APCA, and WCAG checks without mutating global appearance.                                                                                                                                                                      |
| Toolbar, extensions, and minimap          | Pass. The complete toolbar has focused internal ownership and receives canvas bounds from the adapter geometry service without global document lookup. Native controls retain strict dense registration, deterministic grouping, pressed/disabled states, roving focus, Escape-dismissed tooltips, coarse targets, reduced motion, logical RTL placement and centering, narrow reflow, canonical controlled-host proposals, controller-only host callbacks, extension cleanup, and accessible minimap state. |
| Empty state and accessible naming         | Pass. A non-empty accessible name is guaranteed at runtime. Empty-state `ReactNode` content is no longer forced into paragraph content, and its interactive surface receives pointer input while suppressing canvas pan/wheel ownership.                                                                                                                                                                                                                                                                     |
| Teardown and remount                      | Pass. Detachment cancels transient publication and releases measurement targets, observers, listeners, frames, and subscriptions. Navigation controls that require a live controller disable while detached, and remount restores the accepted viewport.                                                                                                                                                                                                                                                     |
| Retained adapter-proof gate               | Pass. The drag workflow now observes the proof's explicit initial-fit readiness gate and normalizes nested auto-scroll after pointer activation, preserving the requirement that final geometry match the displayed preview before one command can commit.                                                                                                                                                                                                                                                   |
| Packed unrelated consumer                 | Pass. The final tarball installed into a temporary unrelated fixture under the empty lifecycle-script allowlist and its TypeScript/Vite build completed successfully.                                                                                                                                                                                                                                                                                                                                        |

## External release gate

Interactive CDP visual review was attempted once earlier on 2026-08-08 and reported no connected
browser surface. It was not retried during this phase audit. Repository Playwright remains the
available visual and interaction evidence; a final audit environment with an available browser
must record the interactive review before release.

CDP visual check: not run (no connected browser surface; recorded external release gate).

## Verification boundary

The final correction commit is followed by the complete authoritative Phase 1 matrix:

- Exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 `quality:all` passed for 134
  project files: repository and dependency policy, formatting, lint, strict types, dead-code
  analysis, complexity and file-length limits, 203 unit tests, six boundary tests, plan-loop
  automation, package/playground builds, tarball allowlisting including the runtime-validation
  helper, and declaration-closure API report generation.
- The final full Chromium Playwright matrix passed 21 of 21 workflows, including rejected
  controlled toolbar proposals, canonical viewport restoration, strict runtime gesture behavior,
  lifecycle teardown, Axe, 200% page scale, 320-pixel reflow, reduced motion, RTL positioning, and
  every visual baseline. The new keyboard-focus baseline was inspected at original resolution and
  shows the focus outline inside the clipped section frame.
- `consumer:check` installed and built the final packed artifact in a temporary unrelated fixture.
- No manifest, lockfile, patch, exception, or dependency-policy input changed. The already-green
  registry-backed `supply-chain:check` therefore postdates the last dependency change and was not
  duplicated.
