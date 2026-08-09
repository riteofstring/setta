# Phase 6 Saved Viewport Preset Evidence

## Result and scope

The eighth repository-actionable Phase 6 batch is implemented. `@setta/workspace` now exposes a
strict versioned host-preference format and an optional controlled React panel for named viewport
presets. Users can capture the current viewport, restore it exactly, rename it, or delete it. The
batch does not add references, variants, generic panes, authentication, sharing, or a field to
`WorkspaceDocument`. Generic edges and ports are the next independently repository-actionable
Phase 6 item.

## Public and ownership boundary

| Boundary        | Implemented contract                                                                                                                                                                                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core preference | `WorkspaceViewportPreset` stores one host-owned ID and name with a finite package viewport. The versioned parse, serialize, and validate helpers reject sparse arrays, accessors, extra fields, duplicate or blank IDs, untrimmed names, malformed JSON, unsupported versions, and invalid viewports. Parsed collections and nested values are immutable. |
| React surface   | `WorkspaceViewportPresets` is an optional controlled panel. It captures the controller's canonical viewport and restores through the existing `setViewport` command; it introduces no canvas adapter, gesture owner, pane registry, or upstream type.                                                                                                     |
| Host authority  | Hosts own IDs, collection order, persistence, authorization, callback acceptance, and whether or where the panel appears. Omitting all mutation callbacks produces a restore-only list.                                                                                                                                                                   |
| Canonical state | Restoring publishes the ordinary `viewport` document change and synchronizes through the existing controlled canvas lifecycle. Selection, sections, hierarchy, and payloads are preserved, and no structural history entry is added.                                                                                                                      |
| Playground      | The backend-free host persists the collection in its strict v2 preference envelope and allocates deterministic local IDs. A host-level toggle mounts the panel in the existing utility overlay without altering the package toolbar.                                                                                                                      |
| Packed consumer | The unrelated fixture round-trips a static preset through the public core helpers and renders the React surface in restore-only mode through declared package exports.                                                                                                                                                                                    |

## Interaction, accessibility, and visual evidence

The panel uses a native section, forms, labels, text inputs, lists, and buttons. Blank names produce
specific inline errors with `aria-invalid`, `aria-describedby`, and focus retained in the invalid
field. Controlled create, rename, and delete requests wait for the matching host collection update
before announcing success or moving focus. Rename receives Escape cancellation; accepted creation
and rename focus the resulting restore button, while deleting the final entry returns focus to the
create input. Restore keeps focus in place and reports restored, already-current, or live gesture
zoom-bound outcomes through a pre-mounted polite status.

Desktop targets are at least 40 CSS pixels and coarse-pointer targets are at least 44. Motion is
limited to motion-safe button feedback, icons use `currentColor` and the package's 1.5-pixel stroke,
and the utility overlay reserves enough inline space for the higher-stacked wrapped workspace
toolbar at 320 CSS pixels. The original-resolution light baseline was inspected directly: the
heading, count, native input, save action, exact viewport summary, visible focused restore action,
and adjacent rename/delete controls are readable, aligned, and unclipped.

The plan's recorded in-app-browser release gate remains unavailable and explicitly says not to
retry it during routine implementation. No GUI, extension, background service, credential, or
remote access was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; the focused
original-resolution Playwright Chromium saved-view baseline was inspected).

## Verification boundary

- Six focused core/static React tests pass for immutable round-trip serialization, strict malformed
  input and accessor rejection, native accessible markup, restore-only rendering, and invalid
  public props.
- The two focused Chromium saved-view workflows pass exact x/y/zoom capture and restoration,
  preservation of section and selection state, controlled create/rename/delete reconciliation,
  reload persistence, restore focus, live feedback, read-only behavior, scoped Axe scans, 200% page
  scale, coarse-pointer targets, reduced motion, and 320-CSS-pixel reflow without horizontal
  overflow or toolbar interception. The new baseline was inspected at original resolution.
- Both directly affected Chromium persistence workflows pass the v2 preference boundary, strict
  invalid-state recovery, reload behavior, 320-pixel reflow, focus reachability, and Axe.
- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passes
  for 18 project files with repository/import boundaries across 310 files, all four manifests,
  formatting, lint and complexity, file lengths, strict types, dead-code analysis, 450 unit tests
  across 42 files, six boundary tests, plan-loop automation, package/playground builds, exact
  tarball contents including both new internal modules, and the declaration report.
- The unrelated consumer installs the local tarball in a temporary directory, passes lockfile
  policy, imports only the public core and React surfaces, passes strict TypeScript and production
  build, and completes its headless restore-only runtime smoke.
- No manifest, lockfile, dependency, lifecycle allowlist, trust policy, or exception changed, so
  the current network-backed Phase 5 supply-chain gate is not duplicated. Deterministic dependency
  policy remains covered by changed-file quality and the packed consumer check.
