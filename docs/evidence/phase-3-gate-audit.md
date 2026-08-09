# Phase 3 Gate Audit

## Result

All repository-actionable Phase 3 work is complete after the coherent audit correction commits
`ac844b58184a2e4d208e3c4995acfc931c39310a`,
`e9b0c52228f293cc5376bfefef3ef44ae4a7fc11`, and
`363446eb0af2dce9c35382016091b1d981264ad1`. No Phase 4 implementation is included. Interactive
in-app CDP review remains unavailable and stays an external release gate; it does not reopen
repository implementation work or authorize seeking a GUI, credentials, services, or remote access.

The audit expands the requested minimum range
`e810b657983eb4dd7157ac8c1e53a9c9e83a4471..b9f098632d4811da69451b12af9ffd53ab221a7a`
across both mid-phase restarts to the complete Phase 3 range
`1b6185d6d63998c0961c796eb92cd80d238c70ad..363446eb0af2dce9c35382016091b1d981264ad1`.
That range contains 82 changed files and 15 implementation, correction, and loop-tooling commits. It
starts immediately after the completed Phase 2 audit and covers recursive rendering and geometry,
orientation and overflow, interaction ownership, sort/free move planning and commands, collision and
preview behavior, host rejection, recursive grouping, keyboard movement, the mixed-depth playground
fixture, and all audit corrections.

One static pass checked every assumption affected by changed or removed Phase 3 behavior. Legal
prototype-mutator section IDs now remain ordinary data throughout move planning, command application,
session geometry, projection, feedback, and layout-preview records. Keyboard free move now includes
the missing nested-to-canvas destination while preserving selected-block offsets and native-handle
focus. The internal dnd-kit adapter prevents keyboard activation's upstream scroll-into-view behavior
from moving the document beneath the captured geometry frame. Recursive history recovery distinguishes
a still-focused section from a newly nested descendant, waits for the recursive DOM to reconcile, and
retries only when focus fell to the document rather than a meaningful user target.

The browser audit also corrected assumptions in retained verification. The 320-pixel playground and
selection-action baselines now include the Phase 3 host-policy and recursive-navigation controls. A
17-pixel transformed-icon antialiasing variance has an explicit 20-pixel screenshot tolerance. Native
horizontal-wheel proof uses a bounded actionability-aware retry while retaining its assertion that the
outer canvas viewport does not move. The nested-to-canvas placement check measures after the expected
native focus scroll. Finally, the exact canvas-drop test chooses blank points outside dnd-kit's
auto-scroll edge so preview and completion intentionally share one stationary geometry frame.

## Gate-by-gate record

| Gate                                      | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recursive containment and rendering       | Pass. Strict canonical containment, derived parents, cycle checks, stable recursive projection, arbitrary visible depth, unchanged subtree identity, minimized-host descendant retention, and the mixed vertical/horizontal depth-three fixture use one document model without a compatibility path.                                                                                                                              |
| Shared all-depth geometry                 | Pass. Every visible frame registers parent, depth, order, and workbench coordinates in one bounded geometry service. Marquee, normalized selection roots, combined bounds, focus/fit, resize, scroll, and movement use the same measured frame at 0.5x, 1x, and 2x without making descendants XYFlow roots.                                                                                                                       |
| Orientation and overflow                  | Pass. Vertical, logical horizontal, and right-to-left order remain canonical through orientation changes. Grow/scroll transitions capture the constrained axis, isolate real native overflow from the outer viewport, retain focus and child order, support empty destinations, and undo/redo exactly.                                                                                                                            |
| Exclusive movement ownership              | Pass. Root layout, structural dnd-kit, and viewport gestures remain mutually exclusive through pointer, long-press touch, keyboard activation, runtime mode changes, completion, and cancellation. The keyboard-sensor adapter preserves ancestor and document scroll before geometry-dependent movement begins.                                                                                                                  |
| Move planning and canonical command       | Pass. Sort and free move cover one section or a normalized sibling block across same-parent, canvas-to-nested, nested-to-canvas, and unrelated-depth destinations. Exact plans preserve block order and canvas offsets, reject stale or malformed input, retain unaffected identities, commit once, and treat `__proto__` and other legal IDs as data.                                                                            |
| Collision, hysteresis, and preview parity | Pass. Selection-shaped collision excludes every moving root, clips child regions, promotes valid children above ancestors, retains and clears state deliberately, mirrors logical horizontal order, and stays zoom-invariant. Layout-stable transforms leave DOM order canonical and completion accepts only the exact displayed plan. The final blank-pane helper avoids introducing auto-scroll into the stationary-plan proof. |
| Rejection and host policy                 | Pass. Mixed-parent, locked-active, self, descendant, cycle, invalid index, stale plan, and synchronous host-policy rejection remain specific, visible, non-color-only, focus-safe, and document-neutral. A locked container remains a destination unless host policy rejects it.                                                                                                                                                  |
| Recursive grouping and history            | Pass. Group and ungroup require one shared parent at any depth, retain identity and order, reconcile controlled results, and restore exact structure through undo/redo. Focus moves to the accepted group or promoted child even when the formerly focused frame remains mounted as a recursive descendant, while external and same-section controls retain focus.                                                                |
| Keyboard and accessibility                | Pass. Vertical and logical horizontal sorting, cross-container free move, descendant-target promotion, canvas promotion, atomic sibling blocks, cancellation, and completion share the pointer plan boundary. Native controls, visible focus, keyboard parity, polite announcements, reduced motion, coarse targets, Axe scans, 200% page scale, and 320-pixel reflow remain covered.                                             |
| Playground and visual evidence            | Pass. The backend-free recursive fixture exercises mixed orientation, grow and scroll containers, depth-three interactive content, empty destinations, host rejection, focus/fit, and runtime movement modes. Every retained baseline passes; both refreshed audit baselines and the recursive-tree variance were inspected at original resolution.                                                                               |
| Public package and unrelated consumer     | Pass. Declared exports remain package-owned and the generated declaration closure contains no XYFlow or application contracts. The last Phase 3 public expansion was the host move validator in `e810b657983eb4dd7157ac8c1e53a9c9e83a4471`, whose packed unrelated-consumer installation and build are already green. Later Phase 3 and audit commits changed no public declaration, so that gate was not duplicated.             |
| Phase boundary                            | Pass. Phase 3 ends with recursive section layout and dual-mode section DnD. No sortable item-tree model, item interaction surface, Phase 4 compatibility adapter, or transitional path was introduced.                                                                                                                                                                                                                            |

## External release gate

Interactive CDP visual review was attempted once earlier on 2026-08-08 and reported no connected
browser surface. It was not retried during this phase audit. Repository Playwright remains the
available visual and interaction evidence; a final audit environment with an available browser must
record the interactive review before release.

CDP visual check: not run (no connected browser surface; recorded external release gate).

## Verification boundary

Focused correction checks passed before the broad matrices: 33 move-planning, command, keyboard, and
collision unit tests; eight geometry-service tests including recursive-history focus loss and recovery;
changed-file formatting and lint; exact history-focus and orientation/overflow browser diagnostics;
both refreshed visual workflows; and the retained keyboard activation, nested-to-canvas, and movement
paths exercised by the full suite.

The first authorized full Chromium run passed 59 of 65 workflows. Its six failures identified the
recursive-history focus gap, two intentional but stale Phase 3 visual baselines, native-wheel timing,
focus-scroll accounting in the new canvas keyboard path, and a 17-pixel transformed-icon rendering
variance. Each cause was inspected from its narrow trace or original-resolution expected, actual, and
diff images before the correction. The final applicable deterministic and browser evidence is:

- Exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 `quality:all` passed for 239
  project files: repository and dependency policy, formatting, lint, strict types, dead-code analysis,
  complexity and file-length limits, 350 unit tests, six boundary tests, plan-loop automation,
  package/playground builds, exact tarball allowlisting, and declaration-closure API report generation.
- The final full Chromium invocation passed 64 of 65 workflows, including every production correction,
  accessibility/reflow path, and visual baseline. Its sole failure was the unchanged exact-plan test
  selecting a blank point 16 pixels inside the canvas, where dnd-kit auto-scroll correctly changed the
  displayed destination before completion. The test-only helper now chooses 64-128-pixel insets, and
  that one exact workflow passed once on the final tree. Thus all 65 workflows have green
  post-relevant-change evidence without a prohibited extra broad retry.
- No public declaration changed after the already-green ordered-item-15 packed-consumer run, so
  `consumer:check` was not duplicated.
- No manifest, lockfile, patch, dependency exception, or dependency-policy input changed anywhere in
  Phase 3. The already-green registry-backed `supply-chain:check` therefore postdates every relevant
  dependency input and was not duplicated.
