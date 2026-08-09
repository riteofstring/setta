# Phase 6 Descendant-Subtree Minimization Evidence

## Result and scope

Container section definitions may now opt into `minimizeScope: "subtree"`. Minimizing such a
section keeps its compact package-owned frame while unmounting every descendant section frame and
host renderer. Omitting the field resolves to the existing `"body"` contract, which unmounts only
the section renderer and retains its child region. The option is generic registry metadata: it adds
no document field, migration, compatibility path, backend dependency, or alternate recursive owner.

This completes the final listed repository-actionable Phase 6 implementation batch. Phase 6 is
ready for its audit.

## Ownership and strict contract

| Concern              | Owner and result                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serialized state     | `WorkspaceDocument.isMinimized` remains the only durable state. Scope is supplied by the host's registered section definition and creates no new history reason.                                                       |
| Validation           | The strict registry accepts only `"body"` or `"subtree"`, rejects subtree scope on a non-container, and rejects an explicit scope when `minimizable` is false.                                                         |
| Recursive projection | The package-owned recursive DOM retains the minimized ancestor, does not render collapsed descendants, and supplies a stable hidden descendant target for the native disclosure contract.                              |
| Geometry and culling | Only visible section IDs are retained. Unmounted descendants release live frames, observers, detachment ownership, and stale selection geometry without creating a second visibility owner.                            |
| Host data            | Canonical hierarchy, payload, positioning, size, presentation, and controlled history remain unchanged and restore on expansion. Renderer-local state may unmount, as already documented for minimization and culling. |

## Selection, navigation, and outline

A single iterative visibility projection derives visible IDs and each hidden section's outermost
collapsed ancestor. Existing controlled or history-driven selections reconcile hidden descendants
to that visible ancestor in canonical order. Control/Command+A selects only visible frames. Direct
controller selection, focus, and fit reject with the public
`section-descendants-collapsed` reason; next/previous navigation skips hidden descendants.

The optional outline continues to represent the canonical document hierarchy. Activating a hidden
descendant cannot move canvas focus into absent DOM; it preserves the visible ancestor selection and
announces that the minimized ancestor must be expanded. Expanding restores the same descendant IDs
and ordinary focus/navigation behavior.

## Accessibility and interaction

The minimize affordance remains a native button with `aria-expanded`. For subtree scope its
accessible name states that descendant sections are included, and `aria-controls` contains stable
body and descendant-region IDs. Collapsing removes descendant frames and controls from the tab order
and accessibility tree. The ancestor retains visible selected/minimized state and the native expand
control; controlled acceptance and retention keep focus on a surviving control. Polite status text
distinguishes body-only minimization from subtree collapse and restoration. No pointer-only action,
focus trap, positive `tabIndex`, or motion dependency was added.

## Playground and packed consumer

The backend-free recursive fixture registers a dedicated subtree-scoped container kind only for its
root. Nested containers continue to prove the default body-only contract in the same workflow. The
fixture exposes controller focus and fit outcomes, allowing exact hidden-descendant rejection to be
observed without a service or credential.

The unrelated consumer fixture sets subtree scope through the declared React `SectionDefinition`
surface. Its temporary packed installation proves the new public type and runtime registry contract
without a source alias, internal import, application state, or Setta runtime.

## Browser and visual proof

Focused Chromium coverage proves both scopes in one recursive document. It checks stable controlled
targets, exact document-change count, retained default descendants, complete opt-in unmount,
visible-only select-all, specific hidden focus/fit rejection, expansion, focus restoration,
320-CSS-pixel reflow, reduced-motion-safe output, and Axe. A focused outline workflow proves that
the canonical row remains discoverable while its canvas target is collapsed, then becomes focusable
after expansion.

The new collapsed-subtree baseline and the directly affected expanded recursive baseline were
inspected at original resolution. The collapsed dark 320-pixel view contains one compact selected
ancestor with an exposed expand control, no descendant frames, and no stale selection overlay. The
expanded view retains its complete hierarchy, outline control, overflow control, and measured
selection geometry. The standing unavailable in-app-browser release gate was not retried.

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 are used.
- Focused registry, selection, controller/navigation, and static React tests cover strict scope
  validation, visibility derivation, hidden-selection reconciliation, visible navigation, server
  rendering, accessible state, and the unchanged body-only default.
- The exact recursive and outline Chromium selectors cover the integrated keyboard, focus,
  announcement, reflow, Axe, and reviewed-baseline contracts described above.
- Changed-file quality passes for 38 project files with repository/import boundaries across 367
  files, deterministic policy for four manifests, formatting, lint and complexity, file lengths,
  strict types, dead-code analysis, 515 unit tests across 50 files, six boundary tests, plan-loop
  automation, package/playground builds, exact tarball contents, documentation links, and the
  declaration report.
- The unrelated locally packed consumer passes its lockfile, strict build, and runtime boundary.
- No manifest, lockfile, dependency, lifecycle-script allowlist, trust policy, or exception changed,
  so the network-backed supply-chain audit is not duplicated. CDP visual check: not run (standing
  unavailable in-app-browser release gate; Playwright Chromium baselines were reviewed instead).
