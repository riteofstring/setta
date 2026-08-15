# Setta Workspace Remaining Implementation Plan

## Purpose and current state

The standalone `@setta/workspace` extraction is implemented and developer-accepted. The completed
work includes the backend-free package and playground, recursive section and item movement, the
Setta canvas and section chrome, built-in parameter controls and meta controls, column resizing,
the workspace shell, Outline, Inspector, context menus, accessibility hardening, performance
coverage, compiled delivery, and unrelated-consumer proof. Accepted evidence lives under
`docs/evidence/`; Git history is the record of the completed implementation batches.

This document now contains only work that remains. It deliberately omits the old preflight log,
completed Phase 0–5 instructions, rejected iterations, and chronological status journal.

The remaining work has two categories:

1. close out the accepted extraction and replace temporary repository policy adapters; and
2. implement three follow-on product milestones identified from the frozen Setta reference.

The closeout and policy cutover are already authorized. Product milestones A–C require explicit
developer authorization one milestone at a time. Authorizing one milestone does not authorize the
next, and this plan does not authorize publishing, licensing, final naming, or application/backend
features.

The product reference remains the clean `../setta-main` worktree at commit `043d3b2e9`. Use it only
for read-only inspection and matched live evidence. A behavior that does not exist there is a new
package decision and requires explicit developer approval rather than being described as parity.

## Remaining work at a glance

- [ ] Clear the `nanoid@3.3.17` vulnerability after its patched release satisfies the mandatory
      release-age window.
- [ ] Cut over from temporary local policy adapters to the new shared Code Policy capabilities.
- [ ] Split the three remaining over-limit parity owners and remove their expiring exceptions.
- [ ] Run the extraction closeout gates and final whole-extraction audit.
- [ ] Milestone A: structural section and group authoring.
- [ ] Milestone B: parameter authoring and feedback.
- [ ] Milestone C: workspace commands and toolbar extensions.
- [ ] Run a final coherence audit after every authorized follow-on milestone.

## 1. Extraction closeout

### 1.1 Resolve the pending vulnerability without weakening policy

The final accepted-output gate is waiting on high-severity advisory
`GHSA-2v37-7h3g-55p8`, currently introduced by `postcss -> nanoid@3.3.17`. The patched 3.x release,
`nanoid@3.3.18`, was published at `2026-08-07 16:41:05 UTC` and becomes eligible under the
repository's seven-day release-age policy after `2026-08-14 16:41:05 UTC`.

After that time:

1. refresh the lockfile through the normal dependency resolver so the transitive dependency is
   `nanoid@3.3.18`;
2. do not add an override, advisory ignore, release-age exception, trust downgrade, or broader
   dependency update;
3. run the offline and online supply-chain checks and confirm the lockfile remains frozen-install
   reproducible;
4. run the all-files static gate and exact packed-consumer proof on the stable tree; and
5. record the successful closeout in accepted evidence.

If a different dependency change becomes necessary, stop and present the exact graph and policy
impact before expanding the update.

### 1.2 Cut over to the completed shared Code Policy support

The current adoption intentionally retains several local providers because the pinned shared
policy could not yet express their generic contracts. Once the separately implemented Code Policy
work is reviewed and available:

1. update the `.code-policy` pin intentionally;
2. migrate `.code-policy.json` to the new shared declarations;
3. prove each replacement against the current provider before deleting the provider;
4. remove target-owned wrappers and workarounds whose complete behavior is now shared; and
5. leave one enforcement owner for every check—never a permanent old/new dual path.

Expected replacement candidates include generic portions of:

- exact workspace dependency and package-manager policy;
- frozen lockfile synchronization;
- transitive release-age checks;
- SPDX dependency-license checks;
- standard component-suite orchestration;
- generic package-boundary and packed-consumer contracts; and
- fixture and ESLint workarounds made unnecessary by shared first-class support.

Retain only Setta-specific assertions that shared policy cannot infer, including the package's
compiled stylesheet contract, its exact public-import boundary, workspace-specific consumer
expectations, and the real browser performance profile. If the new shared implementation does not
fully cover an existing rule, retain that narrow rule and document the remaining gap instead of
silently reducing enforcement.

The cutover is complete only when strict policy diagnosis, all-file static checks, focused tests,
the supply-chain gate, package builds, the packed consumer, and the browser profile all exercise
the new ownership model successfully.

### 1.3 Remove expiring file-length debt

The extraction plan no longer needs a file-length exception after this rewrite. Three parity-owner
exceptions still expire on `2026-08-20`:

- `packages/workspace/src/canvas/ZoomPane.tsx`;
- `packages/workspace/src/dnd/useDropType.ts`; and
- `packages/workspace/src/styles/workspace.css`.

Split each owner along existing responsibilities without changing observable behavior. Preserve
event ownership and state lifecycles when splitting `ZoomPane.tsx`, collision and drop-intent
semantics when splitting `useDropType.ts`, and selector order, specificity, scoping, and the single
compiled CSS artifact when splitting `workspace.css`. Run focused behavior checks after each split
and remove its exception in the same batch.

Do not silently extend an exception. If a safe split cannot be completed before expiry, stop with
the specific risk and request an explicit, short-lived renewal.

### 1.4 Whole-extraction audit

After sections 1.1–1.3 are green, audit the final repository as one package rather than replaying
the old phase history. Confirm that:

- the distribution contains compiled ESM, declarations, source maps, and one scoped stylesheet;
- the package and packed unrelated consumer require neither Tailwind nor Setta configuration;
- React and React DOM remain host-provided peers and other direct dependencies remain exact-pinned;
- no application store, generated backend client, backend concept, private selector, Tailwind class
  name, XYFlow internal, or dnd-kit store has entered the public API;
- all canonical mutations validate before one atomic publication and one change notification;
- drag, resize, pan, wheel, selection, nesting, and native browser gesture ownership still match
  the accepted result; and
- the frozen reference worktree remains unchanged at the recorded commit.

Fix findings in narrow batches and rerun only the affected checks before the final authorized gate.

## 2. Milestone A — structural section and group authoring

This milestone completes generic section/group operations already implied by the package document,
Inspector, context menus, and action registry. Characterize the applicable behavior in frozen main
before each batch.

### A1. Ungroup

Add one canonical ungroup operation over validated group IDs.

- Preserve child order, nested and top-level layout, selection, focus, and one-notification
  publication.
- Define the top-level placement from characterized behavior and an explicit document operation;
  do not invent a positional heuristic.
- Route header, context-menu, Inspector, command, and host invocations through the same operation.
- Reject invalid, locked, missing, mixed-capability, or structurally impossible requests before
  mutation.

### A2. Bounded group overflow

Add an explicit serializable group overflow mode matching main's auto-sized and bounded/scrollable
states.

- When changing an auto dimension to bounded, resolve the measured size through the package's
  established inner/outer box model before the atomic document commit.
- Preserve nested scrolling, item and section drop targets, wheel ownership, resize and reset,
  minimap bounds, and compact/narrow behavior.
- Keep overflow state in the public document rather than a private DOM-derived shadow state.

### A3. Functional section-header menu

Make the section-header menu an action surface rather than a decorative icon when applicable
actions exist.

- Reuse the existing action registry and canonical mutation funnels; do not create a second action
  engine.
- Start with group overflow and ungroup, then expose compatible package and host actions.
- Preserve capability-disabled states, keyboard operation, focus restoration, portal appearance,
  native-control context menus, full-surface section dragging, and compact hit geometry.
- Hide the menu when it has no applicable actions.

### A4. Section tag-color editing

Add the missing canonical tag-color mutation and a compact Inspector editor with reset-to-none.

- Provide the captured default categories and accept an explicit host-supplied palette.
- Keep editing and persistence of a reusable global palette host-owned.
- Never use tag color as the only signal for state or meaning.

### A5. Milestone A acceptance

Implement A1–A4 as separate reviewable batches, then perform one coherence audit. The playground
and packed consumer must exercise every operation through public exports only. Present one combined
developer gate covering header/context/Inspector parity, nested and top-level ungrouping, overflow
scrolling and resizing, drag/pan/wheel ownership, keyboard and focus restoration, dark and light
appearance, RTL, 200% scale, and a compact 320 px host. Record baselines only after acceptance.

Do not import variants, parameter visibility settings, artifact actions, backend ungroup routes, or
main's global settings store because they share a source file with these operations.

## 3. Milestone B — parameter authoring and feedback

This milestone makes the existing batteries-included controls structurally authorable. It does not
reimplement the already-complete value editors, UI-type conversion, renaming, drag-and-drop, column
resizing, or meta controls.

### B1. Insert and delete items

Add validated canonical insertion and deletion operations.

- A host-supplied item factory returns the complete serializable item and stable ID.
- The package owns placement, validation, commit, selection/focus restoration, and one document
  change notification.
- The package does not own domain defaults, Python parameter semantics, or host ID generation.
- All package and host action surfaces call the same operations.

### B2. Package-owned filtering

Add compact per-section item search/filter view state.

- Search built-in labels plus an explicit searchable-text contribution for custom items.
- Never mutate `WorkspaceDocument` merely to filter the rendered view.
- Disable item drag-and-drop and structural keyboard movement while a filter is active.
- Define and test what happens when the current selection becomes hidden.
- Preserve scroll position and do not remount unaffected editors while the query changes.

### B3. Descriptions and help

Extend typed item presentation with optional serializable help text and a compact Inspector editor.

- Render help in a package-owned non-clipping surface.
- Support pointer, keyboard, and screen-reader access without stealing editor focus.
- Keep main's multi-page/frozen tooltip conversion and backend completion plumbing out of scope.

### B4. Validation feedback

Add an explicit host-supplied diagnostic registry keyed by stable item ID.

- Support error, warning, and informational severities with messages.
- Let the package own consistent row paint, accessible descriptions/status, reveal behavior, and
  focus behavior.
- Let hosts own validation, asynchronous work, and persistence.
- Keep diagnostics ephemeral; they do not enter the canonical document.

### B5. Milestone B acceptance

Implement insertion/deletion, filtering, then help/diagnostics as three reviewable batches. Each
batch needs load and mutation validation, pointer/keyboard/focus coverage, item-DnD ownership tests,
packed-consumer coverage, and matched live evidence. Present one combined developer gate before
refreshing baselines.

Do not add pin/unpin semantics, edge-input conversion, callable state, backend routes, type checking,
LSP services, or a second item value editor in the Inspector.

## 4. Milestone C — workspace commands and toolbar extensions

Unify existing package actions behind one public typed command surface.

### C1. Command registry

Evolve the existing action infrastructure into a replace-all registry with stable command IDs,
labels, enabled-state evaluation, execution, and conflict validation over immutable public
workspace contexts.

- Context menus, header menus, Inspector actions, keyboard commands, and toolbar controls must call
  the same command and mutation funnels.
- Host registrations are explicit public inputs and replace atomically; no plugin runtime or
  hidden global registration is introduced.
- Unknown IDs, duplicate IDs, and invalid conflicts fail specifically at the boundary.

### C2. Configurable key bindings

Add platform-aware bindings for existing package operations, including fit/reset/zoom, creation,
group/ungroup, lock/delete, select all, next/previous top-level section, item
move/indent/unindent, and pane/Outline focus.

- Preserve exact-chord lifecycle, editable-target exclusions, browser-native shortcuts, macOS
  swallowed-key recovery, and one-owner gesture rules.
- Detect binding conflicts before activation and expose enough information for hosts to explain
  them.
- Do not intercept a browser or editor chord unless the active command deliberately owns it.

### C3. Host toolbar contributions

Expose typed host toolbar contributions rendered beside the package viewport/minimap controls.

- Contributions reference public command IDs and receive public immutable state only.
- Preserve responsive grouping, logical direction, keyboard order, hit targets, and accepted compact
  paint.
- Do not expose XYFlow `Panel`, package stores, private selectors, or main's plugin runtime.

### C4. Milestone C acceptance

Exercise every command from each applicable action surface and prove identical mutation, selection,
focus, disabled-state, and error behavior. Capture frozen main's applicable shortcuts and control
composition first, then present a combined pointer, keyboard, focus, RTL, 200% scale, and compact
layout gate. Record baselines only after developer acceptance.

Project search, file navigation, run commands, application menu state, and an application-wide
command palette remain out of scope.

## Cross-cutting implementation constraints

Every remaining batch must preserve these contracts:

- The package stays backend-free and authored in TypeScript/React under `packages/workspace/`.
- Public state and extension points are typed, serializable where canonical, and independent of
  Setta application models.
- Canonical mutations validate the whole request before one atomic commit. No aliases, migrations,
  dual paths, shims, heuristic fallbacks, broad catches, or unreachable compatibility states.
- Interaction ownership remains explicit across section drag, item drag, resize, pan, wheel,
  browser navigation gestures, native controls, editors, menus, and panes.
- Selection never changes geometry. Compact visible controls retain adequately sized hit targets.
- Package-only behavior is designed explicitly and accepted as new behavior; it is not labeled
  main parity.
- The distribution remains compiled ESM plus declarations, source maps, and one scoped stylesheet.
- Consumers need neither Tailwind nor repository-specific build configuration.
- Direct dependencies stay exact-pinned except host peer ranges, and dependency changes pass the
  release-age, trust, license, lock, and vulnerability policies.

## Verification and evidence

For each user-visible or interaction batch:

1. reproduce the applicable frozen-main state at a controlled viewport, appearance, zoom, and
   document state;
2. record when the proposed state is absent from main and obtain authority for the package design;
3. implement the smallest coherent change and run its focused tests;
4. run `./check_policy.sh check` and `./check_policy.sh test --changed` near batch completion;
5. compare main and package live without stealing focus from the developer's unrelated work;
6. present side-by-side evidence and obtain explicit developer acceptance;
7. only then add or refresh regression baselines; and
8. run the broader authorized policy, consumer, supply-chain, and browser checks once on the stable
   milestone tree.

Before a merge, use `./check_policy.sh test-levels --base <trusted-base>` and follow the shared
policy's authorization rules for recommended, full, gate, and supplemental suites. Visual
baselines lock accepted output; they never approve previously unreviewed output.

Every milestone must cover, as applicable:

- deterministic unit and component behavior;
- keyboard, screen-reader, focus restoration, and reduced-motion behavior;
- dark/light appearance, RTL, 200% scale, coarse pointer, and 320 px host layout;
- nested groups and top-level sections;
- drag, resize, wheel, pan, and browser-history gesture ownership;
- package build and public export boundaries;
- the packed unrelated consumer; and
- the production browser performance profile.

## Stop conditions

Stop and return to the developer rather than broadening scope when:

- the frozen reference and proposed behavior materially disagree;
- a required state does not exist in main and has not received explicit design authority;
- parity would require application/backend state without a narrow public host seam;
- an operation needs a positional, type, or capability heuristic instead of an explicit contract;
- a dependency or fork change alters drag, resize, zoom, nesting, or gesture feel;
- a visual or interaction milestone has not received developer acceptance;
- a batch becomes too large to compare meaningfully;
- a policy replacement would weaken or duplicate enforcement; or
- automated checks pass while the live result is visibly or behaviorally wrong.

Do not respond to a failed gate by adding unrelated features, broad fallbacks, more snapshots, or
policy exceptions.

## Completion criteria

This plan is complete when:

- the patched dependency clears release-age and vulnerability enforcement without an exception;
- the shared Code Policy cutover has one owner per check and retains all Setta-specific contracts;
- the three parity-owner file-length exceptions are removed;
- the whole-extraction audit and authorized complete gate pass;
- each explicitly authorized product milestone is implemented, developer-accepted, baseline-locked,
  and audited; and
- the package remains backend-free, publicly consumable, visually coherent with Setta, and free of
  implicit publishing, licensing, naming, or compatibility decisions.
