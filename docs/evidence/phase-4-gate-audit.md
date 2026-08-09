# Phase 4 Gate Audit

## Result

All repository-actionable Phase 4 work is complete after the audit correction and the supervising
post-audit correction in `4967f27aa7e06d200a70a3022c7d96512c83f17f`. No Phase 5 implementation is
included.

The requested minimum range
`6735f008effd93f254ac8d44aa823227e72ace74..2351fda47568f032cc6dbdb9100419c28a1f2da4`
already starts at the completed Phase 3 audit boundary and contains every Phase 4 implementation
commit. The audit extends that range through
`4967f27aa7e06d200a70a3022c7d96512c83f17f`: five implementation, audit, and correction commits
changing 47 files, with 5,681 insertions and 254 deletions. No earlier commit belongs to Phase 4, so a
restarted mid-phase range did not hide additional implementation.

One static pass checked every assumption affected by the new sortable-item model, React interaction
surface, playground payload, and adapter behavior. Tree validation remains strict and iterative, move
planning stays immutable and deterministic, and selected roots preserve canonical sibling order.
Keyboard planning now retains the complete selection when the active handle belongs to a selected
descendant, clears a projected preview when movement returns to the original tree, and does not ask
host policy to approve a no-op. `canContainChildren` must return a boolean and cannot contradict
already-rendered descendants.

The React audit corrected lifecycle, ownership, focus, and announcement assumptions. Unmounting an
active item tree releases the workspace interaction owner. Completion focus recovery is bounded,
survives a controlled remount, and stops when the user has focused another meaningful target. Active
item movement owns local Escape and keyboard commands without clearing the containing section's
selection. No-op feedback no longer looks like a valid drop, labels use the canonical moving roots
rather than an active descendant, and Enter and Space have matching documented completion behavior.

The playground audit rejects imported child data beneath a non-group item and resets transient item
selection on import or reset without discarding it during an accepted item move. The upstream dnd-kit
adapter now prefers the real final pointer point over a transform that may drift after feedback layout;
section completion uses the same point for final collision geometry. The retained pointer test waits
for controlled host reconciliation before reading DOM order, and the creation-palette baseline now
includes the Phase 4 field-list entry.

Supervising review then closed two evidence and robustness gaps before Phase 5. A browser workflow now
moves an item to a nested parent, proves the changed section payload in local storage, resets the
playground, restores the changed tree through JSON import, reloads the page, and proves the same nested
structure again. The dnd-kit adapter no longer infers plugin ownership from constructor names: it uses
the exact public `Accessibility` and `AutoScroller` class identities from a new exact-pinned direct
`@dnd-kit/dom@0.5.0` dependency.

## Gate-by-gate record

| Gate                                  | Result and evidence                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Serializable item-tree kernel         | Pass. The non-rendered root, unique IDs, exact placement, reachability, acyclic containment, prototype-mutator IDs, canonical preorder, selection normalization, single and sibling-block plans, no-ops, cycles, containment policy, immutable application, and synchronous host policy remain covered.            |
| Pointer, touch, and keyboard movement | Pass. Handle-only movement supports reorder, indent, outdent, cross-parent placement, empty parents, cancellation, host rejection, immutable selected-block geometry, and final plan parity at 0.5x and 2x zoom. Returning to the original keyboard position clears the preview and completes as a no-op.          |
| Ownership and lifecycle               | Pass. Item movement excludes section layout and viewport competitors, preserves the containing section selection, releases ownership when the tree unmounts, and restores ordinary activators after completion or cancellation. The shared upstream adapter uses the final real pointer point during revalidation. |
| Focus and accessibility               | Pass. Native handles, editable inputs, accessible names and descriptions, polite status output, logical keyboard directions, Space/Enter parity, reduced motion, Axe scans, and remount-safe focus are covered. Focus recovery does not steal focus from a later meaningful user target.                           |
| Controlled host contracts             | Pass. `canContainChildren` and `canMove` are synchronous, side-effect-free decision boundaries with specific malformed-result failures. Final completion revalidates the current tree and host policy, emits at most one plan, and waits for controlled DOM reconciliation in browser assertions.                  |
| Playground and persistence            | Pass. The field-list payload contains real inputs and one nested group. An accepted nested move is present in local storage, survives a reset plus JSON import, and survives a page reload. Malformed non-group containment is rejected, and transient item selection is not serialized into `WorkspaceDocument`.  |
| Visual evidence                       | Pass. The atomic keyboard placeholder and overlay, selected rows, nested inputs, and expanded creation palette were inspected at original resolution. Every retained Playwright visual baseline passes.                                                                                                            |
| Package boundary                      | Pass. Strict types, the exact tarball allowlist, and the generated declaration closure remain green with no XYFlow, dnd-kit, application, or source-path leak. The audit clarifies one testing-subpath preview union but does not change the consumer fixture's core or React import contract.                     |
| Phase boundary                        | Pass. The work ends with one sortable item tree per section, one active item or normalized sibling block, and the documented playground example. Phase 5 hardening, release work, cross-section item moves, mixed-parent blocks, multiple named lists, and compatibility paths are not included.                   |

## Verification boundary

Focused correction checks passed before the final matrices. They included 64 sortable-item and React
unit tests for selection, keyboard projection, callback validation, and static semantics; 48 relevant
sortable-item, section-move, and React tests after the final-pointer correction; exact-file formatting
and lint; package type checking; and the three previously failing browser scenarios together on the
corrected tree.

The first authorized full deterministic matrix was green, but the later browser diagnosis required a
relevant adapter and test correction, so one final deterministic matrix was run after all source edits.
The first full Chromium run passed 65 of 68 workflows. Its three failures were inspected before any
rerun:

- The creation screenshot was intentionally stale because the section library did not yet include the
  new field-list entry.
- A rejected structural move preview had the correct host reason, but completion reconstructed an
  outside-canvas point from a drifted upstream transform even though the trace showed the real pointer
  still inside the canvas.
- The selected-item pointer move announced and emitted the accepted plan, but the assertion read the
  controlled DOM before React reconciliation.

The exact three-scenario correction workflow then passed 3/3 and regenerated only the intentional
creation baseline. Final applicable broad evidence is:

- Exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 `quality:all` passed after the post-audit
  correction for 257 project files: repository boundaries across 256 files, all four dependency
  manifests, formatting, lint, strict
  types, dead-code analysis, complexity and file-length limits, 389 unit tests, six boundary tests,
  plan-loop automation, package/playground builds, exact tarball verification, and declaration-closure
  API report generation.
- The final post-audit full Chromium invocation passed all 69 workflows, including every Phase 4
  pointer, touch, keyboard, persistence, ownership, focus, accessibility, zoom, reflow, reduced-motion,
  and visual-baseline path.
- The unrelated packed consumer installed the corrected artifact and built successfully.
- The exact package manifest and lockfile now declare the adapter's direct use of
  `@dnd-kit/dom@0.5.0`. The registry-backed `supply-chain:check` passed the frozen install,
  minimum-release-age and dependency-trust policy, high/critical vulnerability audit, license
  allowlist, and regenerated machine-readable dependency inventory with no new package resolution or
  exception.
- Phase 4 has no external provider or credential-backed workflow. The repository's self-contained
  Playwright suite is the applicable live browser evidence; unavailable external verification was not
  retried.

The original-resolution Chromium keyboard-preview, creation expected/actual/diff, and corrected
creation baseline were visually inspected. The previously recorded unavailable connected-browser
release gate remains independent of repository implementation and was not retried.

CDP visual check: done (original-resolution Chromium Phase 4 interaction and creation artifacts
inspected; all retained Playwright baselines passed).
