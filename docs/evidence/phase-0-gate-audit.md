# Phase 0 Gate Audit

## Result

All repository-actionable Phase 0 work remains complete after the separate phase audit and its
correction batch. No Phase 1 work is included. Interactive in-app CDP review is unavailable and
remains one external release gate; it does not reopen repository implementation work or authorize
seeking a GUI, credentials, services, or remote access.

This audit applies to source snapshot `043d3b2e9c69caf99d1246f1408b3ad7194b7864` and the
blank-slate commits from `48e06f25a` through the Phase 0 completion batch `44afe5c5e`, plus the
phase-audit correction commit. It should be read with the tooling, interaction, upstream-adapter,
non-DnD, browser, and performance evidence under `docs/evidence` and `perf`.

The correction batch closes every actionable finding from one static pass: invalid final drag
geometry can no longer commit a retained preview; same-root spatial movement preserves persistent
stack order; Shift-click is no longer captured as marquee; root-depth focus has a programmatic
target; source symbols, close-port provenance, and the historical MIT notice are retained; the API
report follows the public declaration closure; lifecycle-script policy has no stale allowlist; and
plan/transcript paths cannot traverse into or out of the repository boundary.

## Gate-by-gate record

| Gate                                             | Result and evidence                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blank standalone tree                            | Pass. Boundary checks allow only the package, Node playground, unrelated consumer fixture, documentation, performance evidence, and project tooling. Current application/backend/plugin/generated/deployment/installer/release/migration paths are absent.                                                                                                                                   |
| Exact toolchain and new hygiene                  | Pass. `.node-version`, `packageManager`, manifests, lockfile, new `.gitattributes`/`.gitignore`/`.editorconfig`, and package-specific `AGENTS.md` are enforced by dependency and boundary checks.                                                                                                                                                                                            |
| Package build, test, and pack                    | Pass. The deterministic quality entrypoint builds and tests the scaffold and checks the explicit tarball allowlist.                                                                                                                                                                                                                                                                          |
| Packed unrelated consumer                        | Pass. `consumer:check` installs the tarball in a temporary unrelated fixture; the last dependency-affecting batch recorded a green run.                                                                                                                                                                                                                                                      |
| One deterministic quality entrypoint             | Pass. `quality` covers boundaries, dependency policy, formatting, lint, strict types, dead code, complexity/file length, unit/automation tests, builds, packing, and API generation.                                                                                                                                                                                                         |
| Node-only browser and accessibility harness      | Pass. Vite/Playwright require no backend runtime. Axe, keyboard completion/cancel, focus restoration, named roles/states, live announcements, 200% page scale, reduced motion, 320-pixel reflow, and visual baselines are mapped in `browser-characterization-matrix.md`.                                                                                                                    |
| Public API and package contract                  | Pass. The generated API report follows every declared entrypoint's relative declaration closure and rejects upstream adapter type leakage; package checks cover every subpath, CSS, tree-shaken consumer build, tarball contents, source escape, forbidden internals, and undeclared exports.                                                                                                |
| Frozen install and exact direct dependencies     | Pass. The checked-in lockfile and exact manifest versions passed the frozen supply-chain run; dependency lifecycle scripts are denied with an empty allowlist.                                                                                                                                                                                                                               |
| Seven-day release quarantine                     | Pass. pnpm policy rejects young or missing publication times, and the registry-backed audit rechecks the complete loaded lockfile.                                                                                                                                                                                                                                                           |
| Release-age exceptions                           | Pass. Validation requires one exact package/version with rationale, owner, and expiry and rejects patterns or permanent exclusions.                                                                                                                                                                                                                                                          |
| Trust and exotic sources                         | Pass. Policy rejects trust downgrade and exotic transitive sources; any trust or immutable-source exception must be exact, documented, owned, and expiring.                                                                                                                                                                                                                                  |
| Reproducible contents and inventory              | Pass. Local package-content verification and machine-readable dependency inventory are generated by repository scripts.                                                                                                                                                                                                                                                                      |
| Vulnerability policy                             | Pass. The registry-backed audit covers runtime/development dependencies, fails unwaived high/critical advisories, and reports lower severities for triage.                                                                                                                                                                                                                                   |
| No application imports                           | Pass. Package, playground, tests, and consumer boundaries reject Setta aliases, app paths, generated contracts, source escapes, and undeclared subpaths.                                                                                                                                                                                                                                     |
| No compatibility or copied application UI        | Pass. There are no legacy paths, project-model adapters, feature flags, compatibility layers, or copied application components. Fixture vectors are independently written; the two intentionally close-ported pure interaction kernels are isolated and attributed.                                                                                                                          |
| Upstream XYFlow representation                   | Pass. `upstream-adapter-proof.md` records the root-node/recursive-DOM choice and uses documented public components, props, hooks, and helpers. No challenger met the criteria.                                                                                                                                                                                                               |
| XYFlow store boundary                            | Pass. The proof does not use the public store API, undocumented store fields, source paths, or upstream types in package contracts.                                                                                                                                                                                                                                                          |
| One all-depth geometry source                    | Pass. One adapter measurement registry populates `WorkspaceGeometryIndex`. Marquee, normalized/combined bounds, focus/fit, collision planning, placeholders/canvas placement, and nested external-drop targeting consume index frames. Unit vectors prove deepest nested targets and coordinates at 0.5x/1x/2x.                                                                              |
| Single movement owner                            | Pass. The exhaustive owner matrix and trusted adapter paths cover XYFlow root layout, dnd-kit sort/free selection blocks, viewport gestures, pointer/touch/keyboard input, cancel, and runtime mode retention.                                                                                                                                                                               |
| Transient high-frequency work and completion     | Pass. Projection tests keep move/resize/selection/viewport/measurement updates outside canonical input. The production projection invokes a host-supplied acceptance callback once for a completed move or resize and zero times on cancel/no-op; the test host records each callback as one history entry. Browser diagnostics show one completion command and bounded render publications. |
| Measurement-ready fit/focus and scroll isolation | Pass. Initial fit waits for all representative frames. Focus restores to interactive content, and nested scrolling changes its own offset without changing the canvas viewport.                                                                                                                                                                                                              |
| Narrow XYFlow patch policy                       | Pass. The only patch is an exact-version declaration correction with smaller-than-fork scope, owner, expiry, upstream path, and a strict-typecheck removal condition. Runtime XYFlow is unpatched.                                                                                                                                                                                           |
| Public dnd-kit boundary                          | Pass. Public provider, sensors, registration, measurement, feedback, and overlay are adapter-local; package-owned event/planning contracts expose no dnd-kit type. Remaining custom behavior is enumerated.                                                                                                                                                                                  |
| Optimistic sorting                               | Pass. It remains disabled because the selected public hook cannot disable that projection independently. Canonical/DOM order remains stable until commit, with constrained-scroll and preview/commit evidence.                                                                                                                                                                               |
| License obligations                              | Pass. Exact upstream releases are MIT. The historical dnd-kit-derived collision and sorting kernels identify their source snapshot and paths beside the implementation, and their MIT notice is retained in the packed artifact. Future source-derived work has the same explicit attribution rule.                                                                                          |
| Reproducible retained outcomes                   | Pass. Source-linked fixtures, generic vectors, matrices, browser references, performance baselines, package-owned types, and adapter proofs survive without the old fork/application tree.                                                                                                                                                                                                   |
| Explicit interaction kernel                      | Pass. Geometry, selection normalization, collision/hysteresis, preview, move planning, ownership, transient projection, and adapter responsibilities all have deterministic executable specifications.                                                                                                                                                                                       |

## External release gate

Interactive CDP visual review was attempted once on 2026-08-08 and reported no connected browser
surface. It was not retried during this phase audit. Repository Playwright remains the available visual
and interaction evidence; a final audit environment with an available browser must record the
interactive review before release.

CDP visual check: not run (no connected browser surface; recorded external release gate).

## Verification boundary

The audit correction changes the package manifest and package-manager policies, so the stable tree
ran the complete affected matrix after the correction work stabilized:

- Exact Node 24.18.1 and pnpm 11.19.0 `quality:all` passed for 106 project files: boundaries,
  dependency policy, formatting, lint, strict types, dead-code analysis, complexity and file-length
  limits, 89 unit tests, six boundary tests, plan-loop automation, package/playground builds,
  tarball allowlisting with the retained notice, and public declaration-closure report generation.
- Full Chromium Playwright passed 13 of 13 workflows, including the invalid-final-target regression,
  additive selection, all-depth/root focus, pointer/keyboard/touch ownership, Axe, 200% page scale,
  320-pixel reflow, reduced motion, render bounds, and both visual baselines.
- `consumer:check` installed the packed artifact in a temporary unrelated fixture and built it with
  the empty lifecycle-script allowlist.
- `supply-chain:check` passed the frozen loaded-lockfile policy, registry-backed trust/age checks,
  high/critical vulnerability audit with no known vulnerabilities, license policy, and dependency
  inventory generation.
