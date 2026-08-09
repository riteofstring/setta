# Phase 6 Viewport-Culling Evidence

## Result and scope

The eleventh repository-actionable Phase 6 batch is implemented. `@setta/workspace` now offers
opt-in, all-depth viewport culling for workbenches whose host-renderer DOM materially exceeds the
visible canvas. The capability removes offscreen renderer subtrees while retaining exact frame
geometry, focus reachability, canonical state, and one public controller boundary.

This batch adds no `WorkspaceDocument` field, history entry, persistence owner, second hierarchy,
upstream store exposure, compatibility path, browser timing budget, or domain-specific limit.
Absolute/freeform positioning inside nested containers is the next independently
repository-actionable Phase 6 item.

## Public and ownership boundary

| Boundary                | Implemented contract                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host preference         | `viewportCullingOptions` accepts strict optional `enabled` and `overscan` fields. Culling is disabled by default; the default overscan is 160 CSS pixels. Non-boolean enablement, negative or non-finite overscan, unknown fields, accessors, and malformed option objects fail specifically. The host owns whether to opt in and which profiled overscan to use.        |
| Observer ownership      | One adapter-local `IntersectionObserver` is rooted at the measured canvas and observes root plus recursive frames with one CSS-pixel root margin. Enabling the capability without browser `IntersectionObserver` support fails specifically. Server rendering remains complete and culling begins only after browser mount.                                              |
| Render boundary         | An offscreen section retains one named, non-tabbable, exact-size `article`; its host renderer, controls, and complete descendant subtree unmount. Stable element semantics and retained dimensions prevent observer oscillation, root collapse, ordered flex reflow, and whole-workbench rerenders during viewport movement.                                             |
| Geometry lifecycle      | The existing all-depth geometry service retains the last measured frame and index registration only while the section remains canonical. Remount reconnects the retained registration; removal and canvas teardown purge it and settle pending work. Focus and fit therefore remain available without serializing measurement state.                                     |
| Focus and activity      | Focus capture pins every containing frame even when panned offscreen. Controller focus force-reveals the exact ancestry path around geometry, viewport synchronization, and DOM focus. Detached, moving, resizing, structurally moving, title-editing, and presentation-editing frames are also pinned. Reference-counted reveals do not add a second interaction owner. |
| Playground and consumer | The default backend-free playground opts in with the documented default overscan. `/?canvas-shell&viewport-culling` supplies a recursive all-depth proof with a tighter margin. The unrelated packed consumer imports the declared option type, opts in without an internal path, and exposes the enabled contract in runtime smoke.                                     |

The preference stays outside the document because it changes only transient browser rendering.
Hosts must keep durable renderer state in section payloads or separate host state: like
minimization, deliberate offscreen culling unmounts component-local renderer state. Selection,
hierarchy, section payloads, stacking, viewport, pane state, clipboard data, and structural history
retain their existing owners.

## Interaction, accessibility, performance, and visual evidence

The lightweight placeholder retains the frame's accessible name plus a hidden description that
its controls and content are outside the rendered viewport. It adds no tab stop or pointer-only
action. Hidden renderer controls do not remain in the accessibility tree. Controller, outline, and
minimap focus paths use the existing measured navigation boundary; once focus enters a frame, that
frame and its ancestors remain mounted through further panning.

The implementation uses one shared observer, per-section external-store subscriptions, exact-size
placeholders, and retained geometry rather than a document-wide viewport subscription. It imposes
no animation and remains stable under reduced motion. Structural assertions cover observer sharing,
all-depth host-body reduction, canonical-geometry retention, focus pinning, deep remount, and
removed-ID cleanup without inventing a cross-machine elapsed-time threshold.

The original-resolution Chromium baseline was inspected directly. It shows the deeply nested
focused frame restored inside its complete hierarchy, a visible focus outline, unchanged toolbar
and minimap chrome, and no placeholder-induced overlap or canvas shift. The 320-CSS-pixel dark
workflow retains page reflow and zero transition duration under reduced motion.

The plan's recorded in-app-browser release gate remains unavailable and explicitly says not to
retry it during routine implementation. No GUI, extension, background service, credential, or
remote access was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; the focused
Playwright Chromium viewport-culling baseline was inspected at original resolution).

## Verification boundary

- Focused framework-neutral, geometry, controller, canvas, and static React coverage passes 69
  tests across five files. It exercises strict option resolution, one shared observer, ancestry
  reveal reference counts, focus retention, retained/remounted geometry, removed-ID cleanup,
  public prop/export rendering, and controller transaction ordering.
- Three focused Chromium workflows pass. They exercise all-depth host-renderer reduction, exact
  placeholders, focused ancestry pinning while offscreen, controller remount after a completed
  viewport gesture, 200% page scale, 320-CSS-pixel reflow, reduced motion, Axe, and the inspected
  baseline.
- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passes
  for 34 project files with repository/import boundaries across 330 files, all four manifests,
  dependency policy, formatting, lint and complexity, file lengths, strict package/playground/root
  types, dead-code analysis, 466 unit tests across 45 files, six boundary tests, plan-loop
  automation, package/playground builds, exact tarball contents, documentation links, and the
  declaration report.
- The unrelated tarball-installed consumer passes lockfile policy, strict TypeScript, production
  build, and headless runtime verification while importing the declared option type and enabling
  culling through the public React prop.
- No manifest, lockfile, dependency, lifecycle allowlist, trust policy, or exception changes in
  this batch; deterministic dependency policy remains part of changed-file quality and the packed
  consumer check, so the network-backed supply-chain gate is not duplicated.
