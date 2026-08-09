# Phase 6 Gate Audit

> Supervisor correction (2026-08-09): this is not final Phase 6 sign-off. The audit missed that
> `WorkspaceSectionContent` instantiates the registered renderer in separate docked and detached
> branches, so detach and redock remount local React state. Phase 6 remains repository-actionable
> until one stable renderer subtree/portal target preserves mount identity in both directions, a
> browser workflow proves uncontrolled state preservation, the tautological representation metadata
> test is removed or replaced with production-path evidence, and an independent re-audit passes.

## Result

This audit originally concluded that all repository-actionable Phase 6 work was complete after one
coherent static review and the corrections in the commit containing this record. The supervisor
correction above reopens that conclusion. The requested minimum range
`1a90381d4132b64822cb50075d9f7e0abd323280..0191e63fd544c86596080224c996ae3b6dba8e78`
starts after most Phase 6 capabilities were already committed. The audit therefore expands to the
completed Phase 5 boundary at `902fad247638386b0a30cccc1b5244c5bfa939ee`, covering all 22 Phase 6
implementation and evidence commits through `0191e63fd544c86596080224c996ae3b6dba8e78`
plus the corrections committed with this record. No Phase 7 or other follow-on implementation is
included.

The static pass reviewed every assumption changed by detachable sections, clipboard adapters, the
outline, auto layout, named and filtered item lists, mixed-parent movement, saved views, generic
connections, registered panes, viewport culling, schema-v2 nested freeform sections, and subtree
minimization. Serializable ownership remains in the framework-neutral document and commands;
rendering, transient gestures, focus, geometry, panes, and host reconciliation remain in the React
surface. Package exports still expose no source path, upstream type, application/backend dependency,
legacy alias, migration, compatibility shim, or alternate runtime.

The review corrected the following coupled assumptions:

- Clipboard paste now retains its busy owner through controlled reconciliation, rejects a registry
  or capability change after an asynchronous host clone, and rejects finite inputs whose normalized
  positions or extents overflow to a non-finite value instead of serializing them as `null`.
- Saved-view creation, rename, and deletion now have one immediate mutation owner, native disabled
  controls, `aria-busy`, pending feedback, acceptance-driven focus, and a live fallback after
  deletion. Restore now settles both accepted and controlled-host-retained viewport outcomes.
- Async controller focus and fit reject specifically when a target becomes hidden by subtree
  minimization during geometry resolution. An open selection-action menu closes when its selection
  becomes invisible, and a positioning confirmation cannot commit through a disconnected collapsed
  descendant trigger or stale geometry.
- Collision ancestry now promotes every owned child region, including an empty ordered region, above
  its containing section frame. This restores the existing deepest-valid-container contract that was
  accidentally narrowed to freeform regions during Phase 6.
- Toolbar assertions and 15 affected visual baselines now include the implemented outline control.
  A retained structural-ownership test also centers the workbench before pointer activation so page
  position cannot place its activation point inside dnd-kit's window auto-scroll edge.

## Gate-by-gate record

| Gate                                        | Result and evidence                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serializable document and commands          | Pass. Schema version 2 has one explicit ordered/freeform layout union, exact child-position keys, finite coordinates, immutable edits, one history boundary, and no old-shape parser or compatibility path. Clipboard framing now also rejects overflow-derived non-finite geometry.                                                                                   |
| Recursive representation and geometry       | Pass. One outer XYFlow viewport and package-owned recursive DOM retain one all-depth geometry/culling owner through ordered/freeform switching, nested scroll, movement, grouping, placement, positioning, culling, and subtree minimization.                                                                                                                          |
| Movement and collision                      | Pass. Pointer, touch, and keyboard movement share exact preview/completion, target memory, ancestor promotion, host revalidation, atomic selected-block plans, focus restoration, and local coordinate conversion. Empty ordered and freeform child regions both outrank their containing frames.                                                                      |
| Controlled host reconciliation              | Pass. Clipboard, saved-view restore/mutation, positioning, focus/fit, selection actions, and document commands settle only from current canonical props or return a specific retained/rejected outcome. Overlapping clipboard and saved-view mutations cannot overwrite their pending reconciliation owner.                                                            |
| Visibility, focus, and accessibility        | Pass. Subtree collapse removes hidden descendants from actions, focus, fit, navigation, geometry, tab order, and the accessibility tree while preserving the canonical outline. Native controls, visible `:focus-visible` treatment, announcements, focus restoration, Axe, reduced motion, coarse pointers, RTL, 200% scale, and 320-CSS-pixel reflow remain covered. |
| Playground and visual evidence              | Pass. The backend-free playground demonstrates every Phase 6 capability and the controlled-retention fixtures. All 110 Chromium workflows pass. The 15 changed baselines were inspected at original resolution and retain readable light/dark, RTL, focus, selection, pane, toolbar, and 320-pixel layouts.                                                            |
| Performance                                 | Pass. The built-artifact milestone covers 1,024 document sections, 512 siblings and positioning children, 256 collision candidates, 2,000 items, and depth 2,048. It retained suite checksum `149675570`; 80 public-controller conversions of 512 children completed in 953.691 ms with checksum `2498560`.                                                            |
| Packaging, dependencies, and phase boundary | Pass with the packed runtime smoke retained as a release gate below. Deterministic boundaries, dependency policy, builds, exact tarball contents, documentation links, and declaration generation pass. No manifest, lockfile, dependency, trust policy, exception, publication setting, or next-phase source changed.                                                 |

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 ran the checks. The system
  Corepack launcher failed before executing pnpm with its own dynamic-import bootstrap error, so it
  was not repeated; the repository-local exact launcher was used for every recorded result.
- Focused unit and browser diagnostics covered clipboard overflow and reconciliation, controller
  collapse during geometry, positioning and selection-menu collapse, controlled saved-view
  retention, and empty ordered-region collision. The final focused collision file passed 19 tests,
  and each corrected browser selector passed before the broad final matrix.
- Final post-source-change `quality:all` passed for 368 project files with repository/import
  boundaries across 367 files, policy checks for four manifests, formatting, lint, complexity and
  file length, strict types, dead-code analysis, 519 unit tests across 50 files, six boundary tests,
  plan-loop automation, package/playground builds, exact tarball validation, documentation links,
  and the regenerated public declaration report. The sole later test-stability edit separately
  passed exact-file Prettier and ESLint checks. The final audit documents then passed exact-file
  Prettier, diff-integrity and link-target checks, file-length policy, and repository boundaries
  across the resulting 368-file boundary set.
- The first audit Chromium matrix passed 92 of 110 workflows and exposed 18 actionable retained
  assumptions: 13 visual workflows producing 15 stale baselines, two toolbar assertions, and three
  empty-container collision workflows. The focused visual batch, toolbar corrections, collision
  unit, and exact collision workflows passed after the relevant fixes. The post-source-change broad
  run then passed 109 of 110; its trace showed the remaining ownership test activating at a window
  auto-scroll edge after page scroll. That exact selector passed after centering the workbench, and
  the final settled-tree invocation passed all 110 workflows in 1.1 minutes. No identical failing
  command was repeated against an unchanged tree.
- `perf:milestone` passed with the deterministic observations and checksums recorded above. No
  dependency input changed, so the already-green network-backed release-age, trust, license,
  inventory, and vulnerability audit was not duplicated.

## Release gates

`consumer:check` was invoked once on the final source tree. It built a fresh tarball after
`quality:all` had validated the exact artifact contents, then its orchestration terminal was
compacted and closed after the temporary consumer process exited and cleaned up. The terminal result
after artifact construction could not be recovered.
The user-authorized audit permits each broad gate at most once, so the command was not duplicated and
the final packed-consumer install/build/runtime result remains an explicit release gate. Earlier
Phase 6 batches retain green tarball-installed consumer evidence for the public clipboard,
positioning, pane, saved-view, culling, and subtree-minimization contracts.

The standing connected in-app-browser surface remains unavailable. Repository and user policy say
not to seek or start a missing GUI, background service, credential, or remote session, so it was not
retried. The self-contained Playwright Chromium suite and original-resolution baseline inspection
remain the available visual evidence.

CDP visual check: not run (standing unavailable in-app-browser release gate; all 110 Playwright
Chromium workflows passed and the refreshed baselines were inspected at original resolution).
