# Phase 2 Gate Audit

## Result

All repository-actionable Phase 2 work is complete after the coherent audit correction commits
`b9ea93e5f8ddd29391e35a3c5881d17bf700fbb4` and
`2ce3a1ca1685efffc842e4c3611671900f0260bb`. No Phase 3 implementation is included. Interactive
in-app CDP review remains unavailable and stays an external release gate; it does not reopen
repository implementation work or authorize seeking a GUI, credentials, services, or remote access.

The audit expands the requested minimum range
`38150f5604cd94489cb7797980fe236bda7b6921..570622e385a4d740bb3b4d7da7010e39d10dec59`
across the mid-phase restart to the complete Phase 2 range
`24dd653dacbb8f311dce38b9bc06da8f1f715e74^..2ce3a1ca1685efffc842e4c3611671900f0260bb`.
That range contains 103 changed files and 24 implementation, correction, plan, and audit commits. It
starts immediately after the completed Phase 1 audit and includes the registry/frame foundation,
movement and selection, title and presentation editing, both architecture decompositions, creation,
external drop, section state and sizing, selection actions, grouping, populated minimap, history,
playground persistence, and both final audit corrections.

One static pass checked the assumptions affected by every changed or removed Phase 2 behavior. The
first correction closes four actionable gaps. Top-level ungrouping now preserves legal
prototype-mutator IDs in its position record. Controlled creation, title, and presentation proposals
wait for canonical host reconciliation before selection, focus, editor closure, or success feedback;
declined proposals restore or retain focus and cannot leave a stale deferred action that later hijacks
an unrelated host replacement. Root-node synchronization reuses unchanged node, renderer-data,
position, and style identities, with a 128-root proof for isolated document, selection, viewport,
movement, and resize updates. The plan and package documentation now keep recursive child rendering
in Phase 3 while retaining Phase 2 child data and sizing metadata.

The authorized broad browser run then exposed two earlier Phase 2 assumptions outside the correction
diff. A delayed programmatic viewport-reset completion could consume a later wheel gesture after its
rendered transform moved, so the canvas now marks that completion as superseded and lets the user
gesture publish its canonical viewport. The retained 320-pixel canvas-shell baseline still described
the Phase 1 header even though the page had moved to Phase 2; the refreshed baseline was inspected at
original resolution and retains the complete two-line heading, readable copy, stable controls, empty
canvas, minimap, and document JSON without horizontal overflow.

## Gate-by-gate record

| Gate                                          | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section registry and unrelated host renderers | Pass. Stable unique kinds, strict runtime registration, creation metadata, sizing/containment/minimization defaults, every chrome mode, document compatibility, package-owned accessible frames, scoped appearance/read-only context, host state continuity, and automatic pointer/wheel isolation remain covered without exposing the registry or renderer internals.                                                              |
| Canonical projection and large root sets      | Pass. XYFlow nodes remain adapter-local projections of canonical roots. Transient pointer movement, resize, selection lift, and viewport state do not mutate the document per frame. Unchanged projected nodes and renderer data retain identity across a 128-root regression, so one root update does not rerender unrelated host bodies.                                                                                          |
| Controlled and uncontrolled ownership         | Pass. Every accepted action still uses the canonical command boundary once. Controlled creation, title, style, movement, resize, state, selection action, history, and viewport proposals reconcile to the host document. Rejected creation and editor proposals report retained state, restore or retain focus, and clear deferred work before a later host replacement.                                                           |
| Movement, selection, and geometry             | Pass. Pointer and keyboard movement, zoom-correct selected-root blocks, grid and non-grid steps, locks, marquee partial/full modes, select-all, clearing, normalized roots, measured focus/fit, deliberate viewport movement, one completion publication, cancellation, and visible focus remain covered at the supported zooms and 200% page scale.                                                                                |
| Title and presentation editing                | Pass. Native title form semantics, empty and asynchronous host rejection, cancellation, controlled reconciliation, focus restoration, all chrome modes, resettable gamut-safe accent/tag choices, transient preview, textual tag cues, live capability revocation, and truthful polite feedback remain covered. Pending style controls are natively disabled until their canonical result settles.                                  |
| Creation and external drop                    | Pass. Searchable toolbar and pointer/keyboard context creation, strict host factories, deterministic measured smart placement, exact coordinates, one change, controlled acceptance/rejection, selection/focus handoff, and narrow reflow remain covered. Generic drop validation, deepest eligible target/index, snapshotted browser data, exact workbench point, capability rejection, and host-owned semantics remain unchanged. |
| State, sizing, and structure                  | Pass. Lock/minimize semantics, fixed/content axes, observer-bounded content sizing, pointer/keyboard resize constraints, batch lock/delete, persistent stacking, top-level group/ungroup order and geometry, focus restoration, controlled rejection, and undo/redo remain canonical. Prototype-mutator child IDs now survive planned top-level ungroup positions.                                                                  |
| Minimap and viewport lifecycle                | Pass. Empty and populated minimap behavior, exact point and section navigation, one viewport publication, gesture coalescing, teardown, remount, and programmatic supersession remain covered. A user wheel gesture now supersedes the delayed end of a reset instead of leaving rendered and canonical viewports divergent.                                                                                                        |
| Structural history                            | Pass. Accepted structural and presentation changes record once; viewport and selection stay outside history; undo/redo restore recorded selection and appropriate focus; redo branches clear; controlled rejection retains entries; unrelated controlled replacement clears stacks; and scoped standard shortcuts leave host editors alone.                                                                                         |
| Playground persistence                        | Pass. Note and status kinds, strict JSON import/export, host-payload validation, last-valid recovery, confirmed example reset, separate versioned document/preference local storage, read-only behavior, and accessible progressive controls remain backend-free. The package itself remains storage- and file-agnostic.                                                                                                            |
| Accessibility, reflow, and visual evidence    | Pass. Native controls, names, roles, pressed/expanded/busy states, keyboard parity, focus restoration, pre-mounted live regions, coarse targets, reduced motion, RTL, 200% page scale, 320-pixel reflow, and Axe scans remain in the browser matrix. Every retained visual baseline passes; the corrected canvas-shell baseline was inspected at original resolution.                                                               |
| Public package and unrelated consumer         | Pass. Declared exports remain package-owned and the generated declaration closure contains no XYFlow or application contracts. The last public declaration expansion was the history commit `383448897f9211522e9fc966ea520d92e3b5bbec`, whose packed unrelated-consumer verification is already green. Later Phase 2 and audit commits changed no public declaration, so that gate was not duplicated.                              |
| Phase boundary                                | Pass. Phase 2 stores and validates recursive child data and preserves nested sizing metadata, but renders only top-level roots. Visible recursive children, nested layout, and all-depth structural DnD remain explicitly assigned to Phase 3; no compatibility path or second document model was introduced.                                                                                                                       |

## External release gate

Interactive CDP visual review was attempted once earlier on 2026-08-08 and reported no connected
browser surface. It was not retried during this phase audit. Repository Playwright remains the
available visual and interaction evidence; a final audit environment with an available browser must
record the interactive review before release.

CDP visual check: not run (no connected browser surface; recorded external release gate).

## Verification boundary

Focused correction checks passed before the broad matrix: strict package and playground typechecks,
changed-file lint, 40 directly affected unit tests, and eight creation/presentation Chromium
workflows covering controlled acceptance, rejection, delayed host replacement, focus, announcements,
existing editor behavior, Axe-backed paths, and 320-pixel creation reflow.

The first authorized full Chromium run passed 49 of 51 workflows. Its two failures were the genuine
reset/wheel lifecycle race and the stale Phase 1 canvas-shell baseline described above. The narrow
gesture workflow and the regenerated narrow visual workflow passed after those fixes stabilized.
The final applicable deterministic and browser evidence is:

- Exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 `quality:all` passed for 209
  project files: repository and dependency policy, formatting, lint, strict types, dead-code
  analysis, complexity and file-length limits, 300 unit tests, six boundary tests, plan-loop
  automation, package/playground builds, exact tarball allowlisting, and declaration-closure API
  report generation.
- The final full Chromium invocation passed 50 of 51 workflows, including both corrected failures,
  every accessibility/reflow path, and every visual baseline. Its sole failure was the unchanged
  adapter-proof touch workflow under the parallel run. That workflow had already passed in the first
  full invocation after its last relevant code change and passed immediately in its one isolated run
  on the final commit. Thus all 51 workflows have green final-tree or post-relevant-change evidence;
  the complete suite was not redundantly retried.
- No public declaration changed after the already-green history packed-consumer run, so
  `consumer:check` was not duplicated.
- No manifest, lockfile, patch, dependency exception, or dependency-policy input changed anywhere in
  Phase 2. The already-green registry-backed `supply-chain:check` therefore postdates every relevant
  dependency input and was not duplicated.
