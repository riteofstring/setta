# Phase 1 Gate Audit

## Result

All repository-actionable Phase 1 work is complete after the separate phase audit and its
correction batch. No Phase 2 work is included. Interactive in-app CDP review remains unavailable
and stays an external release gate; it does not reopen repository implementation work or authorize
seeking a GUI, credentials, services, or remote access.

The audit expands the requested minimum range
`33c6cfae8cb577e2ee609af538c0109b7ab808e9..fd303763647d26caa08ec29ccc9410bf32bc497b`
to the complete Phase 1 implementation from
`b395a25b276fecfce3dd13f0bba739c8a07e9841` through
`fd303763647d26caa08ec29ccc9410bf32bc497b`, plus the phase-audit correction commit containing
this record. It should be read with the Phase 0 gate audit, upstream-adapter proof, interaction
matrices, package API report, and browser baselines.

The correction batch closes every actionable finding from one static pass: production grid zoom
uses the documented public XYFlow viewport hook rather than a direct store subscription; built-in
fit targets only the root sections actually projected in Phase 1; controlled hosts that reject a
gesture completion restore the unchanged canonical viewport; workspace accessible names reject
blank runtime values; arbitrary empty-state markup has valid, interactive, gesture-isolated
containment; navigation actions cannot run while the playground canvas is detached; and the
retained adapter-proof drag workflow now waits for measured initial fit and settles nested
auto-scroll after pointer ownership begins.

A later supervisor-required architecture correction extracts the complete toolbar into a focused
471-line internal module and reduces the production canvas adapter from 996 to 548 lines, restoring
useful Phase 2 headroom. Toolbar zoom now receives live bounds from the adapter-owned geometry
service instead of querying the ambient global document, preserving correct ownership for multiple
documents, iframes, and detached windows. The rendered native controls, accessible names and
states, roving focus, tooltips, ordering, and public controller boundary remain unchanged.

## Gate-by-gate record

| Gate                                      | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serializable document                     | Pass. Versioned recursive documents, canonical root/child placement, parent derivation, deterministic traversal, JSON-value constraints, strict parsing, arbitrary-depth round trips, and specific malformed-state failures remain framework-neutral in `core.ts` and focused internal helpers.                                                                                                                        |
| Controlled and uncontrolled ownership     | Pass. The modes remain mutually exclusive and stable. Controlled proposals mutate no package-owned canonical state; a rejected viewport gesture now re-synchronizes the XYFlow transform to the unchanged host document after completion.                                                                                                                                                                              |
| Public controller and capability boundary | Pass. One stable package controller routes commands through canonical validation, emits compact reasons once, suppresses no-ops, rejects layout/structure/presentation edits specifically, and keeps viewport navigation available in read-only mode.                                                                                                                                                                  |
| Public package closure                    | Pass. Declared entrypoints expose only package-owned contracts. The generated declaration closure contains no XYFlow node, edge, store, or change-event types and consumers require no source alias or internal path.                                                                                                                                                                                                  |
| XYFlow adapter boundary                   | Pass. Production uses documented public components, helpers, `useReactFlow`, and `useViewport`; it no longer subscribes directly to the upstream store. Upstream node and viewport types remain adapter-local.                                                                                                                                                                                                         |
| Root projection and recursive input       | Pass. Phase 1 renders canonical spatial roots without mutating the recursive document. Toolbar fit uses that same visible root set, so valid but not-yet-rendered descendants cannot be sent to the measurement gate. Recursive frame rendering remains Phase 3 work.                                                                                                                                                  |
| Viewport lifecycle                        | Pass. Live transforms remain transient, one accepted gesture publishes at completion, cancellation restores its baseline, programmatic synchronization stays outside publication, rejected controlled proposals roll back visually, and rapid toolbar commands converge on the canonical viewport.                                                                                                                     |
| Gesture policy and host arbitration       | Pass. Runtime pan/zoom modes, direction, speed, bounds, activation keys, pointer buttons, pinch, double click, and independent host pan/wheel suppression remain validated and covered across pointer, touch, keyboard, and wheel paths.                                                                                                                                                                               |
| Geometry and navigation                   | Pass. One measurement registry owns visible-frame registration, coalesced resize/scroll/window/projection updates, conversions, readiness-aware bounds, focus/fit, and deterministic next/previous traversal. Focus prevents browser scrolling and works at 200% page scale.                                                                                                                                           |
| Grid, snapping, and appearance            | Pass. Dot/line/cross grids use the public viewport zoom, remain aligned at negative coordinates and non-unit zoom, and stay independent from snapping. Scoped light/dark/system tokens retain automated gamut, APCA, and WCAG checks without mutating global appearance.                                                                                                                                               |
| Toolbar, extensions, and minimap          | Pass. The complete toolbar has focused internal ownership and receives canvas bounds from the adapter geometry service without global document lookup. Native controls retain deterministic grouping, pressed/disabled states, roving focus, Escape-dismissed tooltips, coarse targets, reduced motion, RTL placement, narrow reflow, controller-only host callbacks, extension cleanup, and accessible minimap state. |
| Empty state and accessible naming         | Pass. A non-empty accessible name is guaranteed at runtime. Empty-state `ReactNode` content is no longer forced into paragraph content, and its interactive surface receives pointer input while suppressing canvas pan/wheel ownership.                                                                                                                                                                               |
| Teardown and remount                      | Pass. Detachment cancels transient publication and releases measurement targets, observers, listeners, frames, and subscriptions. Navigation controls that require a live controller disable while detached, and remount restores the accepted viewport.                                                                                                                                                               |
| Retained adapter-proof gate               | Pass. The drag workflow now observes the proof's explicit initial-fit readiness gate and normalizes nested auto-scroll after pointer activation, preserving the requirement that final geometry match the displayed preview before one command can commit.                                                                                                                                                             |
| Packed unrelated consumer                 | Pass. The final tarball installed into a temporary unrelated fixture under the empty lifecycle-script allowlist and its TypeScript/Vite build completed successfully.                                                                                                                                                                                                                                                  |

## External release gate

Interactive CDP visual review was attempted once earlier on 2026-08-08 and reported no connected
browser surface. It was not retried during this phase audit. Repository Playwright remains the
available visual and interaction evidence; a final audit environment with an available browser
must record the interactive review before release.

CDP visual check: not run (no connected browser surface; recorded external release gate).

## Verification boundary

The stable Phase 1 package source ran the complete affected matrix after the correction work
stabilized:

- The post-audit architecture correction passed exact-toolchain changed-file quality with 182 unit
  tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code,
  complexity/file-length, builds, exact tarball contents, and the declaration-closure API report.
  Seventeen focused React-surface and geometry-service unit tests passed. The directly affected
  Chromium toolbar workflow passed its geometry-owned-bounds regression, native controls,
  naming/state, roving focus, tooltip, ordering, rapid zoom, extension cleanup, RTL, Axe, and
  inspected visual baseline; the unrelated packed consumer built successfully.
- Exact Node 24.18.1 and pnpm 11.19.0 `quality:all` passed for 129 project files: repository and
  dependency policy, formatting, lint, strict types, dead-code analysis, complexity and file-length
  limits, 182 unit tests, six boundary tests, plan-loop automation, package/playground builds,
  tarball allowlisting, and declaration-closure API report generation.
- The initial full Chromium run passed 20 workflows and exposed one retained adapter-proof
  readiness/auto-scroll race. After the browser specification was corrected, its single focused
  workflow passed and the final full Chromium Playwright matrix passed 21 of 21 workflows,
  including controlled-host viewport rejection, lifecycle teardown, Axe, 200% page scale,
  320-pixel reflow, reduced motion, and all visual baselines.
- `consumer:check` installed and built the final packed artifact in a temporary unrelated fixture.
- No manifest, lockfile, patch, exception, or dependency-policy input changed. The already-green
  registry-backed `supply-chain:check` therefore postdates the last dependency change and was not
  duplicated.
