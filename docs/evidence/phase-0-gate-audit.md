# Phase 0 Gate Audit

## Result

All repository-actionable Phase 0 work is complete. The branch remains ready for a separate phase
audit before Phase 1 implementation. Interactive in-app CDP review is unavailable and remains one
external release gate; it does not reopen repository implementation work or authorize seeking a
GUI, credentials, services, or remote access.

This audit applies to source snapshot `043d3b2e9c69caf99d1246f1408b3ad7194b7864` and the
blank-slate commits through the Phase 0 completion batch. It should be read with the tooling,
interaction, upstream-adapter, non-DnD, browser, and performance evidence under `docs/evidence` and
`perf`.

## Gate-by-gate record

| Gate                                             | Result and evidence                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blank standalone tree                            | Pass. Boundary checks allow only the package, Node playground, unrelated consumer fixture, documentation, performance evidence, and project tooling. Current application/backend/plugin/generated/deployment/installer/release/migration paths are absent.                                                      |
| Exact toolchain and new hygiene                  | Pass. `.node-version`, `packageManager`, manifests, lockfile, new `.gitattributes`/`.gitignore`/`.editorconfig`, and package-specific `AGENTS.md` are enforced by dependency and boundary checks.                                                                                                               |
| Package build, test, and pack                    | Pass. The deterministic quality entrypoint builds and tests the scaffold and checks the explicit tarball allowlist.                                                                                                                                                                                             |
| Packed unrelated consumer                        | Pass. `consumer:check` installs the tarball in a temporary unrelated fixture; the last dependency-affecting batch recorded a green run.                                                                                                                                                                         |
| One deterministic quality entrypoint             | Pass. `quality` covers boundaries, dependency policy, formatting, lint, strict types, dead code, complexity/file length, unit/automation tests, builds, packing, and API generation.                                                                                                                            |
| Node-only browser and accessibility harness      | Pass. Vite/Playwright require no backend runtime. Axe, keyboard completion/cancel, focus restoration, named roles/states, live announcements, 200% page scale, reduced motion, 320-pixel reflow, and visual baselines are mapped in `browser-characterization-matrix.md`.                                       |
| Public API and package contract                  | Pass. Generated declarations and API review plus package checks cover every declared subpath, CSS, tree-shaken consumer build, tarball contents, source escape, forbidden internals, and undeclared exports.                                                                                                    |
| Frozen install and exact direct dependencies     | Pass. The checked-in lockfile and exact manifest versions passed the frozen supply-chain run; lifecycle scripts remain deny-by-default with reviewed exact allowlisting.                                                                                                                                        |
| Seven-day release quarantine                     | Pass. pnpm policy rejects young or missing publication times, and the registry-backed audit rechecks the complete loaded lockfile.                                                                                                                                                                              |
| Release-age exceptions                           | Pass. Validation requires one exact package/version with rationale, owner, and expiry and rejects patterns or permanent exclusions.                                                                                                                                                                             |
| Trust and exotic sources                         | Pass. Policy rejects trust downgrade and exotic transitive sources; any trust or immutable-source exception must be exact, documented, owned, and expiring.                                                                                                                                                     |
| Reproducible contents and inventory              | Pass. Local package-content verification and machine-readable dependency inventory are generated by repository scripts.                                                                                                                                                                                         |
| Vulnerability policy                             | Pass. The registry-backed audit covers runtime/development dependencies, fails unwaived high/critical advisories, reports lower severities, and recorded no known vulnerabilities. No manifest or lockfile changed after that run.                                                                              |
| No application imports                           | Pass. Package, playground, tests, and consumer boundaries reject Setta aliases, app paths, generated contracts, source escapes, and undeclared subpaths.                                                                                                                                                        |
| No compatibility or copied application UI        | Pass. There are no legacy paths, project-model adapters, feature flags, compatibility layers, or copied application components. Evidence fixtures are independently written.                                                                                                                                    |
| Upstream XYFlow representation                   | Pass. `upstream-adapter-proof.md` records the root-node/recursive-DOM choice and uses documented public components, props, hooks, and helpers. No challenger met the criteria.                                                                                                                                  |
| XYFlow store boundary                            | Pass. The proof does not use the public store API, undocumented store fields, source paths, or upstream types in package contracts.                                                                                                                                                                             |
| One all-depth geometry source                    | Pass. One adapter measurement registry populates `WorkspaceGeometryIndex`. Marquee, normalized/combined bounds, focus/fit, collision planning, placeholders/canvas placement, and nested external-drop targeting consume index frames. Unit vectors prove deepest nested targets and coordinates at 0.5x/1x/2x. |
| Single movement owner                            | Pass. The exhaustive owner matrix and trusted adapter paths cover XYFlow root layout, dnd-kit sort/free selection blocks, viewport gestures, pointer/touch/keyboard input, cancel, and runtime mode retention.                                                                                                  |
| Transient high-frequency work and completion     | Pass. Projection tests keep move/resize/selection/viewport/measurement updates outside canonical input, record one accepted command/history entry, and none on cancel; browser diagnostics show one completion command and bounded render publications.                                                         |
| Measurement-ready fit/focus and scroll isolation | Pass. Initial fit waits for all representative frames. Focus restores to interactive content, and nested scrolling changes its own offset without changing the canvas viewport.                                                                                                                                 |
| Narrow XYFlow patch policy                       | Pass. The only patch is an exact-version declaration correction with smaller-than-fork scope, owner, expiry, upstream path, and a strict-typecheck removal condition. Runtime XYFlow is unpatched.                                                                                                              |
| Public dnd-kit boundary                          | Pass. Public provider, sensors, registration, measurement, feedback, and overlay are adapter-local; package-owned event/planning contracts expose no dnd-kit type. Remaining custom behavior is enumerated.                                                                                                     |
| Optimistic sorting                               | Pass. It remains disabled because the selected public hook cannot disable that projection independently. Canonical/DOM order remains stable until commit, with constrained-scroll and preview/commit evidence.                                                                                                  |
| License obligations                              | Pass. Exact upstream releases are MIT, notices are retained where required, no upstream or historical implementation source was copied, and future copying has an explicit attribution rule.                                                                                                                    |
| Reproducible retained outcomes                   | Pass. Source-linked fixtures, generic vectors, matrices, browser references, performance baselines, package-owned types, and adapter proofs survive without the old fork/application tree.                                                                                                                      |
| Explicit interaction kernel                      | Pass. Geometry, selection normalization, collision/hysteresis, preview, move planning, ownership, transient projection, and adapter responsibilities all have deterministic executable specifications.                                                                                                          |

## External release gate

Interactive CDP visual review was attempted once on 2026-08-08 and reported no connected browser
surface. It was not retried during this completion batch. Repository Playwright remains green visual
and interaction evidence; a final audit environment with an available browser must record the
interactive review before release.

CDP visual check: not run (no connected browser surface; recorded external release gate).

## Verification boundary

The Phase 0 completion batch changes no manifest, lockfile, package-manager policy, patch, or
supply-chain exception. It therefore does not duplicate the already-green frozen install,
registry-backed loaded-lockfile, vulnerability, license, inventory, or unrelated-consumer gates.
The batch runs deterministic changed-file quality plus focused unit, package type, and directly
affected Chromium selectors; the exact results are recorded in the completion commit and plan
status.

Recorded completion results:

- `corepack pnpm quality` passed for 18 changed project files, including dependency/boundary policy,
  formatting, lint, strict types, dead-code analysis, complexity and file-length limits, 87 unit
  tests, six boundary automation tests, plan-loop automation, builds, tarball allowlisting, and API
  report generation.
- The focused unit target passed 25 non-DnD evidence, geometry-index, drag-planning, and transient
  projection tests; the exact-toolchain package typecheck passed independently.
- Focused Chromium selectors passed pointer cancel/complete and focus restoration, accepted
  keyboard sorting, trusted touch sorting, canvas-drop preview/commit parity at 0.5x/1x/2x, and the
  primary workflow at 200% page scale.
