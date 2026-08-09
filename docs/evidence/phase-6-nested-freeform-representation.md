# Phase 6 Nested-Freeform Representation Evidence

## Result and scope

The bounded representation prerequisite for Phase 6 nested freeform positioning is complete.
Package-owned absolutely positioned recursive DOM is the selected direct-child owner. The outer
exact-pinned XYFlow instance remains the only workbench pan/zoom store and viewport, and the
existing dnd-kit structural adapter remains the movement owner for section reparenting.

This is deliberately a prerequisite batch, not the freeform product implementation. It does not
increment `WorkspaceDocument`, add the discriminated child-layout contract, change production
movement plans, expose a positioning control, or accept freeform documents. The next
repository-actionable work begins at that schema-v2 and framework-neutral command boundary.

## Bounded comparison

The executable playground route `/?nested-freeform-proof` renders exactly the three candidates
named by the plan. Each rejected candidate stops at its first demonstrated contract failure.

| Candidate                                                   | Executable observation                                                                                                                                                                                                                                                                                                                                                | Disposition                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| One all-section XYFlow graph                                | A `parentId` child and its parent render as sibling `.react-flow__node` wrappers under the same flat `.react-flow__nodes` element. The child wrapper is not a descendant of the parent's native child region, so parent DOM cannot own its flex participation, native scroll, or clipping.                                                                            | Rejected at native containment.                  |
| One separately provided fixed XYFlow per freeform container | Six nested container instances require six explicit `ReactFlowProvider` stores plus the outer store, and render seven viewport elements. Omitting those providers causes the inner store updaters to compete for the outer graph instead of creating independent fixed surfaces.                                                                                      | Rejected at single-owner and bounded-store cost. |
| Package-owned absolutely positioned recursive DOM           | Six representative recursive DOM regions remain beneath one outer XYFlow store and one viewport. Direct children switch ordered/freeform presentation, a selected two-section block preserves its offset under one local-space commit, a child reparents between freeform and ordered DOM, and native nested scrolling leaves the outer viewport transform unchanged. | Selected.                                        |

No challenger imports a private XYFlow source path. The proof uses the declared
`ReactFlowProvider`, `ReactFlow`, and `useStoreApi` surfaces only; the store identity is evidence
inside the package testing entry point and does not enter a product declaration or persisted model.

## Selected ownership and invariant coverage

| Plan invariant                             | Selected-owner evidence                                                                                                                                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordered-to-freeform-to-ordered             | One native control switches the representative direct-child region in both directions without changing direct-child DOM order or remounting its focused controls. The production conversion contract remains future work.                                                        |
| Arbitrary mixed depth                      | The selected root contains spatial direct children and an ordered, natively scrolling descendant container. The existing audited recursive projection already supplies unbounded DOM recursion and all-depth frame registration.                                                 |
| Grow and native scroll overflow            | The selected spatial region contributes its own content surface; the nested named region has real overflow, receives keyboard focus, and scrolls to its final child without changing the one outer viewport transform.                                                           |
| Same-parent multi-section spatial movement | The executable representative moves Alpha and Beta by the same 24-by-16 local delta and records one atomic command. This proves the representation can project a block without another viewport; production dnd-kit planning and commit behavior remain in the incomplete batch. |
| Cross-parent free movement                 | The representative moves Beta between the freeform parent and ordered nested container through one commit per direction while retaining the one outer store. Existing Phase 3 pointer/touch/keyboard dnd-kit evidence remains the executable gesture-owner substrate.            |
| Focus, marquee, and geometry               | Native controls stay focusable through nested scrolling and layout switching. Existing all-depth geometry, marquee, focus/fit, and selection-overlay tests consume registered DOM frames rather than XYFlow child nodes, so the selected representation preserves their owner.   |
| Viewport and inner-scroll culling          | Existing package culling owns recursive frames and retained geometry. The selected candidate creates no inner XYFlow culling owner; every recursive frame remains eligible for exactly that one package observer.                                                                |
| One gesture owner                          | The selected candidate introduces no second pan/zoom or store surface. Production spatial and structural gestures will continue through the existing root-XYFlow/dnd-kit interaction coordinator.                                                                                |
| Bounded many-container cost                | Six nested XYFlow containers produce seven stores/viewports; six recursive DOM regions produce one store/viewport. The comparison stops there rather than expanding into an open-ended upstream audit.                                                                           |

The proof fixture's semantic buttons are command-boundary demonstrations, not a handwritten
replacement for production pointer, touch, keyboard, collision, snapping, or pan/zoom behavior.
Those behaviors remain assigned to the existing adapters and the incomplete freeform batch.

## Accessibility, layout, and visual evidence

The selected surface uses native buttons, a named keyboard-scrollable region, a pre-mounted polite
status, visible `:focus-visible` outlines, and 40-pixel minimum controls. Reduced motion removes the
optional press transition. At 320 CSS pixels the root derives a bounded width, controls wrap inside
the root, and only the spatial child region exposes horizontal overflow. The final geometry
diagnostic measured every proof control from x=60 through x=270 inside the flow's x=29 through
x=291 bounds.

The reviewed original-resolution Chromium baseline shows all three positioning/movement controls,
the selected Alpha frame, a partial Beta frame that visibly hints at horizontally available spatial
content, all six recursive-region diagnostics, one XYFlow store, and the selected-owner rationale.
The plan's recorded in-app-browser release gate remains unavailable and was not retried. No GUI,
extension, credential, remote access, or unrelated background service was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; the focused
Playwright Chromium nested-freeform baseline was inspected at original resolution).

## Verification boundary

- The focused unit selector passes two tests for the exact three-candidate comparison, one selected
  owner, and one concrete stopping reason per candidate.
- The challenger Chromium workflow passes the flat-wrapper and seven-store/seven-viewport
  observations. The interaction workflow passes ordered/freeform switching, native scroll and
  focus isolation, equal selected-block deltas, one-command accounting, reparenting, focus
  retention, and one outer viewport. The narrow workflow passed reduced motion, 320-CSS-pixel page
  reflow, and Axe before its stronger control-bounds assertion exposed the proof fixture's grid
  sizing error.
- Under the implementation loop's two-failure stop rule, that combined narrow selector was not run
  a third time. A different bounded Playwright geometry diagnostic on the corrected final source
  measured the 210-pixel controls wholly inside the 262-pixel flow. The separated exact visual
  selector then passed and regenerated the inspected baseline.
- Required changed-file quality passed for 11 project files with repository boundaries across 336
  files, dependency policy, formatting, lint and complexity, file lengths, strict types, dead-code
  analysis, 468 unit tests across 46 files, six boundary tests, plan-loop automation, package and
  playground builds, exact tarball contents, documentation links, and the declaration report.
- The unrelated tarball-installed consumer passed lockfile policy, strict build, and Chromium
  runtime verification through the declared public package boundary.
- No manifest, lockfile, dependency, lifecycle allowlist, trust policy, or exception changed, so the
  current network-backed supply-chain gate is not duplicated. Deterministic dependency policy
  remains part of changed-file quality.
