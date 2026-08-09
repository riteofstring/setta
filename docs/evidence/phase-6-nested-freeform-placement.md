# Phase 6 Nested-Freeform Placement Evidence

## Result and scope

Clipboard paste and external drop now target the canvas, an ordered parent, or a freeform parent
through one explicit placement discriminator. The package derives all ordered indices and spatial
coordinates from its existing document and geometry owners; hosts receive an exact public
candidate and never need to infer a parent's layout.

This completes the paste and external-drop slice of the remaining Phase 6 nested-freeform batch.
The production positioning control, the final integrated performance/browser matrix, descendant
subtree minimization, and the Phase 6 audit remain downstream.

## Placement contract and ownership

`WorkspaceExternalDropCandidate` now carries `placement: { type: "ordered"; index }` or
`placement: { type: "freeform"; position }`. Canvas placement uses workbench coordinates, ordered
parents use their orientation-aware canonical insertion boundary, and freeform parents use a
non-negative point relative to the measured child surface. The old flat `insertionIndex` field was
removed without an alias or compatibility path. Preview validation and the final host callback
receive the same immutable candidate.

External-drop activation captures the recursive geometry index plus freeform child surfaces from
the package-owned coordinate system. Deepest eligible containment, current outer pan/zoom, and
nested native scrolling are resolved before the host is consulted. Missing required freeform
geometry produces specific invalid feedback, and successful completion reuses the captured final
frame so one drop does not force a duplicate geometry flush.

Clipboard paste routes its last meaningful canvas point or selected-section anchor through the
same candidate resolver. Ordered destinations insert at the resolved canonical index. Canvas and
freeform destinations smart-place the complete cloned root block in the destination coordinate
system, preserve measured relative offsets, avoid direct sibling rectangles, apply the configured
grid, and translate at local start edges. The immutable paste command validates the current parent
layout and placement, updates its exact child list and position map atomically, and rejects stale or
mismatched input without inserting a partial subtree.

Controlled reconciliation verifies the accepted parent, canonical child order, and every freeform
root position before reporting success. One accepted paste remains one history entry, selects the
pasted roots, focuses the accepted primary root, and keeps the existing undo, redo, and reload
contract. The JSON adapter and clipboard MIME frame remain backend-free and versioned; host clone
validation remains the only owner of payload and domain-reference cloning.

## Playground, accessibility, and visual proof

The backend-free nested-freeform fixture enables the documented JSON clipboard adapter, pastes a
selected section block into a nested freeform parent, and applies an external drop through the new
public placement union. The unrelated consumer compiles and runs against the same declared
external-drop shape without internal imports.

The focused Chromium workflow verifies keyboard copy/paste, snapped destination-local placement,
exact parent-map serialization, selection and native focus handoff, a pre-mounted polite
announcement, and Axe in the accepted state. It then previews an external drop over the same
freeform surface, checks the non-color parent highlight and allowed label, completes the drop at the
displayed local point, and checks the host-controlled document result. The generic external-drop
workflow retains one geometry capture and the canvas/ordered path, while the clipboard workflow
retains root smart placement, undo/redo, reload, focus, announcements, and Axe.

The new nested-freeform placement preview and the directly affected generic external-drop and root
clipboard baselines were inspected at original resolution. They show visible focus/selection and
drop feedback, current package controls, unclipped content, and no transient hover tooltip. The
standing unavailable in-app-browser/CDP release gate was not retried.

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 were used.
- Focused Vitest coverage passes 25 clipboard, external-drop, and canvas-navigation tests for every
  destination discriminator, local coordinate clamping, orientation-aware ordered insertion,
  block-offset preservation, non-overlap/grid placement, atomic position-map application, and stale
  placement rejection.
- The directly affected Chromium selectors pass nested freeform paste and external drop, the
  generic canvas/ordered external-drop contract, and root clipboard copy/paste through
  undo/redo/reload. They cover controlled change counts, one geometry capture, focus restoration,
  polite announcements, Axe, and three inspected original-resolution baselines.
- Changed-file quality passes repository/import boundaries, deterministic dependency policy,
  formatting, lint and complexity, file lengths, strict types, dead-code analysis, unit and boundary
  tests, plan-loop automation, package/playground builds, exact tarball contents, documentation
  links, and the declaration report.
- The unrelated tarball-installed consumer passes lockfile policy, strict build, and runtime
  verification through declared exports.
- No manifest, lockfile, dependency, lifecycle-script allowlist, trust policy, or exception changed,
  so the network-backed supply-chain gate was not duplicated. The recorded unavailable in-app
  browser release gate was not retried.

## Remaining repository-actionable work

The production positioning control is next. It must provide a named keyboard-reachable
ordered/freeform switch, request confirmation only for material rearrangement, preserve exact
controlled reconciliation and focus, and feed the shared geometry consumers. The final integrated
performance/browser matrix and descendant-subtree minimization follow before the Phase 6 audit.
