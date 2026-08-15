# Setta Workspace UX Implementation Plan

## Purpose and status

The standalone `@setta/workspace` extraction and its original UX are complete and
developer-accepted. The remaining product work is four UX milestones:

- [x] Milestone A — structural section and group authoring.
- [x] Milestone B — parameter authoring and feedback.
- [ ] Milestone C — workspace commands and toolbar extensions.
- [ ] Milestone D — built-in text and code sections.

A milestone checkbox is complete only after its repository work, developer acceptance gate,
accepted baseline, and phase audit are complete. While work is in progress, update the milestone's
status sentence rather than checking it prematurely.

Completed extraction history and accepted evidence live in Git and `docs/evidence/`; do not
reimplement those phases. Security, shared-policy migration, file-length debt, packaging audits,
and other non-UX closeout work live in
`docs/plans/setta-workspace-technical-closeout-plan.md` and are outside this plan.

This is the plan to pass to
`scripts/automation/codex-loop/run-plan-implementation-loop.sh`. Launching the loop authorizes
repository-actionable implementation in the earliest incomplete milestone. The loop must stop at
the developer acceptance gate after each milestone. Only the developer can approve the result and
allow the next milestone to begin.

The frozen `../setta-main` worktree at commit `043d3b2e9` remains the authority for behavior it
implements. Use it read-only. When a proposed reusable state does not exist in main, record that
absence and obtain explicit developer approval for the package behavior instead of calling it
parity.

## UX outcome

After this plan, people using the workspace can:

- reorganize groups directly, constrain oversized groups, and discover section actions from the
  section header;
- visually categorize sections without relying on color as the only signal;
- add, delete, find, understand, and troubleshoot parameters inside the workspace;
- operate common workspace actions efficiently from consistent menus, keyboard shortcuts, and
  toolbars;
- add readable prose, Markdown documentation, and editable source snippets without building a
  custom section renderer; and
- receive the same result no matter which action surface invokes an operation.

These capabilities remain backend-free and useful to unrelated React hosts. They extend the
existing opinionated Setta UX rather than turning the package into a generic node editor or design
system.

## Reference anchors

Inspect the running reference and the narrow source owners before implementing each behavior:

- `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`,
  `ToggleGroupOverflowMode.tsx`, and `UngroupButton.tsx` for section-header actions, overflow, and
  ungrouping;
- `frontend/src/components/Panes/UiEditor/SectionConfig/SectionTagColorSettings.tsx` for section tag
  colors;
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx` for parameter insertion,
  deletion, and filtering;
- `frontend/src/components/Panes/UiEditor/QuickInfoConfig/QuickInfoConfig.tsx` for parameter display
  names and descriptions;
- `frontend/src/state/actions/keyActivations.ts` and the shortcut settings for workspace command
  behavior; and
- `frontend/src/forks/xyflow/controls/Controls.tsx` for viewport-control composition;
- `frontend/src/components/Section/Layouts/TextBlock.tsx` and
  `frontend/src/components/Panes/UiEditor/MarkdownEditor/MarkdownEditor.tsx` for plain-text and
  Markdown editing/rendering; and
- `frontend/src/components/Section/Layouts/CodeArea.tsx` and
  `frontend/src/components/Panes/UiEditor/SectionConfig/CodeAreaSettings.tsx` for the reusable code
  editor behavior and settings boundary.

Shared source files contain application-only behavior. Extract only the behavior named in this
plan.

## Milestone A — structural section and group authoring

**Status: A1–A4 repository work, the combined developer acceptance gate, the accepted-output
baseline, and the phase audit are complete. The developer accepted Milestone A on 2026-08-14; the
baseline is locked under `docs/evidence/milestone-a/`, including the post-acceptance atomic ungroup
notification correction.**

Complete the generic section and group operations already implied by the package document,
Inspector, context menus, and action registry.

### A1. Ungroup

Add one canonical ungroup operation over validated group IDs.

- Preserve child order, nested and top-level placement, selection, focus, and a single document
  change notification.
- Determine top-level placement from characterized behavior and an explicit document operation;
  do not invent a positional heuristic.
- Route header, context-menu, Inspector, command, and host invocations through the same operation.
- Reject invalid, locked, missing, mixed-capability, or structurally impossible requests before
  changing the document.

The operation should make regrouping and restructuring feel predictable even in deeply nested
workspaces.

### A2. Bounded group overflow

Add an explicit serializable group overflow mode matching main's auto-sized and bounded/scrollable
states.

- When changing an auto dimension to bounded, preserve the group's visible size through the
  established inner/outer box model.
- Preserve nested scrolling, item and section drop targets, wheel ownership, resize and reset,
  minimap bounds, and compact/narrow behavior.
- Keep the mode in the public document so it reloads consistently.
- Avoid scroll jumps when toggling the mode or editing children.

This lets users keep large groups manageable without losing access to their contents or disrupting
canvas navigation.

### A3. Functional section-header menu

Make the section-header menu a real action surface whenever applicable actions exist.

- Reuse the existing action registry and canonical operations; do not create a second action
  engine.
- Start with group overflow and ungroup, then expose compatible package and host actions.
- Preserve disabled states, keyboard operation, focus restoration, portal appearance,
  native-control context menus, full-surface section dragging, and compact visible geometry.
- Hide the menu when it has no applicable actions.
- Keep the menu's icon, placement, and interaction treatment consistent with the accepted section
  chrome.

The menu makes common section actions discoverable without crowding every header with buttons.

### A4. Section tag-color editing

Add the missing canonical tag-color operation and a compact Inspector editor with reset-to-none.

- Provide the captured default categories and accept an explicit host-supplied palette.
- Keep reusable global-palette editing and persistence host-owned.
- Never use tag color as the only indication of state or meaning.
- Preserve readable contrast and the accepted section appearance in light and dark modes.

Tag colors give users a quick supplementary way to scan and organize a large workspace.

### A5. Milestone A acceptance gate

Implement A1–A4 as separate reviewable batches, then audit them as one interaction system. The
playground must demonstrate every operation through public package APIs.

Present one live developer gate covering:

- nested and top-level ungrouping, including order, placement, selection, and focus;
- overflow toggling, scrolling, resizing, reset, and reload;
- header, context-menu, and Inspector action consistency;
- section tag colors and reset behavior in light and dark modes;
- section drag, item drag, pan, wheel, minimap, and native-browser gesture ownership;
- keyboard and screen-reader operation;
- RTL, 200% scale, coarse pointer, and a compact 320 px host; and
- custom host actions and palettes through public APIs.

Only after explicit developer acceptance may the loop record baselines, complete the milestone
audit, and proceed to Milestone B.

Do not import variants, parameter visibility settings, artifact actions, backend ungroup routes,
or main's global settings store.

## Milestone B — parameter authoring and feedback

**Status: B1–B4 repository work, the combined developer acceptance gate, the accepted-output
baseline, and the phase audit are complete. The developer accepted Milestone B on 2026-08-14 and
subsequently accepted the requested pre-Milestone-C interaction corrections through commit
`06cb64534`. The baseline is locked under `docs/evidence/milestone-b/`, including the
post-acceptance filter scroll-restoration correction. The phase audit preserved the accepted
quick-info geometry while adding viewport containment for page, resize, and window-size changes.**

Make the existing batteries-included parameter controls structurally authorable. Do not rework the
already accepted value editors, UI-type conversion, renaming, drag-and-drop, column resizing, or
meta controls unless the new behavior exposes a direct regression.

### B1. Insert and delete parameters

Add validated canonical insertion and deletion operations.

- A host-supplied item factory returns the complete serializable item and stable ID.
- The package owns placement, validation, commit, selection/focus restoration, and one document
  change notification.
- The package does not own domain defaults, Python parameter semantics, or host ID generation.
- Every package and host action surface calls the same operations.
- Deleting the selected item moves focus and selection to a predictable surviving target.

This lets users construct a section's parameter surface without leaving the workspace.

### B2. Package-owned filtering

Add compact per-section parameter search and filtering.

Package-only design decision authorized by this plan: the query is mounted per-section view state,
not document state. Built-in items search their serializable labels; a custom item is searchable
only through its owning section kind's explicit callback over frozen public section and item
snapshots. Filtering retains canonical selection and explains selected items hidden by the query.

- Search built-in labels plus an explicit searchable-text contribution for custom items.
- Filtering changes only view state and never mutates `WorkspaceDocument`.
- Disable item drag-and-drop and structural keyboard movement while a filter is active.
- Make the behavior of a selected but hidden item explicit and understandable.
- Preserve section scroll position and avoid remounting unaffected editors as the query changes.
- Provide a clear empty result and a quick way to clear the query.

Filtering keeps long parameter sections usable without changing their saved order or contents.

### B3. Descriptions and help

Extend typed item presentation with optional serializable help text and a compact Inspector editor.

- Render help in a package-owned surface that is not clipped by section overflow.
- Support pointer, keyboard, and screen-reader access without stealing editor focus.
- Keep the content legible at compact widths and 200% scale.
- Extract main's reusable multi-page, copy, and frozen quick-info lifecycle. Keep its
  tooltip-to-section conversion and backend completion plumbing in the application.

Help text lets users understand unfamiliar controls in context rather than consulting separate
documentation.

### B4. Validation feedback

Add an explicit host-supplied diagnostic registry keyed by stable item ID.

- Support error, warning, and informational severities with messages.
- Let the package own consistent row styling, accessible status and descriptions, reveal behavior,
  and focus behavior.
- Let hosts own validation rules, asynchronous work, and persistence.
- Keep diagnostics ephemeral; they do not enter the canonical document.
- Ensure color is not the only severity signal.

Diagnostics make problems visible next to the affected parameter while keeping domain validation
outside the UI package.

### B5. Milestone B acceptance gate

Implement insertion/deletion, filtering, then help/diagnostics as three reviewable batches. Present
one live developer gate covering:

- pointer and keyboard insertion/deletion, including invalid and locked states;
- selection, focus, and scroll restoration;
- filtering, hidden selection, empty results, and disabled structural movement;
- non-clipping help in nested and bounded groups;
- diagnostic severities, updates, clearing, and accessible announcements;
- interaction with every accepted built-in parameter type and a custom renderer;
- light/dark appearance, RTL, 200% scale, and compact sections; and
- equivalent behavior in the playground through public package APIs.

Only after explicit developer acceptance may the loop record baselines, complete the milestone
audit, and proceed to Milestone C.

Do not add pin/unpin semantics, edge-input conversion, callable state, backend routes, type
checking, LSP services, or a second parameter value editor in the Inspector.

## Milestone C — workspace commands and toolbar extensions

**Status: developer-accepted on 2026-08-15; accepted-baseline recording and the post-acceptance
milestone audit remain. C1 repository work is complete: one typed command registry now owns the
package's structural, parameter-authoring, and host actions, and the section context menu, section
header menu, Outline row menu, item menu, Inspector action rows, and the ungroup shortcut all
resolve and run through it. C2's first batch is complete: one chord vocabulary, a public binding
registry with conflict detection and per-platform labels, and configurable bindings for grouping,
ungrouping, deletion, locking, and the parameter moves, with the held interaction gestures reserved
against them. C2's second batch is complete: fit view, zoom in, zoom out, reset zoom, zoom to the
pointer, select all, and select the top-level non-group sections are bindings over the same
operations the accepted toolbar runs, and select-all now finishes the reference's unimplemented
single-section branch over the rows a section is showing. C2's third batch is complete: the
package now has the reference's focus-scope seam for its two shell panes and its canvas, and next
and previous top-level section, pane focus, and canvas focus are bindings over it, including the
reference's canvas reading order, its `go-to` active-section intent, and its minimum-distance pane
travel. C2 is now complete: its fourth batch gives a host creation command its own conflict-checked
chord in the same binding vocabulary, and ports the reference's backend empty-space search — prefer
the visible pane, then beside it, then after the workspace — so a section created without a pointer
lands in real empty space and the canvas travels to it when it had to land out of sight. C3 is
complete: a host places typed contributions in the toolbar around the package's own viewport and
minimap groups, each naming a pane command or a creation command, and the package paints them as
toolbar controls carrying the reference's contributed-group rule and disabled opacity with the
command's label, pressed state, and refusal sentence. The phase audit over C1–C3 corrected two
defects: binding-conflict detection now answers for the platform the workspace runs on, where
`Mod` and `Ctrl` are one key off macOS, and the playground now subscribes its host command state
where it mounts the workspace, so a contributed toolbar control repaints when the host state behind
it changes. The developer completed the C4 live gate and accepted the result. The package-only
decisions and the deliberate behavior changes every batch introduces are recorded in
`docs/evidence/milestone-c/`; the loop must now lock the accepted baseline and complete the audit
before checking Milestone C or beginning Milestone D.**

Make frequent workspace actions faster and consistent across every action surface.

### C1. Command registry

Evolve the existing action infrastructure into one public typed command registry with stable IDs,
labels, enabled-state evaluation, execution, and conflict validation over immutable public
workspace contexts.

- Context menus, header menus, Inspector actions, keyboard shortcuts, and toolbar controls call the
  same commands and canonical operations.
- Host registrations are explicit inputs and replace atomically; do not introduce hidden global
  registration or a plugin runtime.
- Unknown IDs, duplicate IDs, and invalid conflicts fail clearly at registration.
- Disabled commands explain their state consistently to every action surface.

A single command model prevents an action from behaving differently depending on where the user
invokes it.

### C2. Configurable keyboard shortcuts

Add platform-aware bindings for existing package operations, including fit/reset/zoom, creation,
group/ungroup, lock/delete, select all, next/previous top-level section, parameter
move/indent/unindent, and pane/Outline focus.

- Preserve exact-chord lifecycle, editable-target exclusions, browser-native shortcuts, macOS
  swallowed-key recovery, and one-owner gesture rules.
- Detect binding conflicts before activation and expose enough information for hosts to explain
  them.
- Do not intercept a browser or editor chord unless an active command deliberately owns it.
- Keep keyboard and pointer results identical, including focus and announcements.

Shortcuts make repetitive workspace editing faster without breaking text editors or browser
navigation.

### C3. Host toolbar contributions

Expose typed host toolbar contributions beside the package viewport and minimap controls.

- Contributions reference public command IDs and receive public immutable state only.
- Preserve responsive grouping, logical direction, keyboard order, hit targets, and accepted
  compact paint.
- Let hosts omit contributed controls entirely.
- Do not expose XYFlow `Panel`, package stores, private selectors, or main's plugin runtime.

This gives consuming applications useful customization without forcing them to overlay private
canvas internals or create visually inconsistent controls.

### C4. Milestone C acceptance gate

Exercise every command from each applicable action surface and prove identical mutation,
selection, focus, disabled-state, and error behavior. Present one live developer gate covering:

- default and host-defined commands;
- binding conflicts and platform-specific shortcut labels;
- editable controls, CodeMirror, native inputs, browser navigation, and swallowed-key recovery;
- header, context-menu, Inspector, keyboard, and toolbar consistency;
- optional host toolbar groups at desktop and compact widths;
- keyboard order, screen-reader names, focus restoration, and disabled-state announcements; and
- light/dark appearance, RTL, 200% scale, coarse pointer, and a 320 px host.

Only after explicit developer acceptance may the loop record baselines and request the final
whole-plan UX audit.

Project search, file navigation, run commands, application menu state, an application-wide command
palette, and a plugin runtime remain out of scope.

## Milestone D — built-in text and code sections

**Status: not started. Begin only after Milestone C's accepted baseline and audit are complete.**

Add two optional, batteries-included content-section registrations. Hosts can register either,
both, or neither alongside their own section kinds. Their document data and configuration are
typed, serializable, validated at the package boundary, and mutated through the workspace's
existing controlled-document path. They use the accepted section chrome, nesting, selection,
locking, resize, overflow, Outline, Inspector, context-menu, quick-help, and command behavior.

Implement the canonical new contracts directly. Do not add legacy data shapes, migrations,
transitional readers or writers, compatibility paths, or fallback behavior.

### D1. Text and Markdown section

Add one built-in content section that can present either plain text or Markdown.

- Provide explicit plain-text and Markdown formats plus edit and rendered display modes.
- Use the package's CodeMirror foundation in edit mode. A locked or read-only section remains
  selectable and scrollable but cannot mutate its text.
- Preserve whitespace and wrapping for plain text. Render the reusable main-branch Markdown
  surface, including headings, links, lists, tables, task lists, inline code, fenced code with
  language-aware highlighting and copy, and math, without enabling raw HTML.
- Expose narrow typed configuration for the initial format, display mode, font size, and allowed
  formats. Hosts may omit the display-mode control or force one mode.
- Keep content changes atomic and serializable, preserve selection and scroll where practical when
  switching modes, and avoid editor remounts during unrelated workspace changes.
- Match main's applicable typography, spacing, overflow, header icon, and edit/render control at
  equivalent scale and appearance.

Do not port docstring conversion, variants, project configuration, artifact creation, backend
completion, or application persistence.

### D2. Code Editor section

Add one built-in CodeMirror section for source and configuration text.

- Support the package's reusable language set: Python, Bash, JavaScript, TypeScript, JSON, YAML,
  TOML, Markdown, and plain text.
- Expose typed serializable options for language, line wrapping, line numbers, indentation width,
  and read-only state. Locking also makes the editor read-only.
- Keep editing controlled through one document mutation path while preserving cursor, selection,
  undo history, scroll, and editor focus across unrelated workspace updates.
- Give the editor ownership of text selection, editing keys, completion keys when explicitly
  enabled by package configuration, and its own scrollable overflow. The surrounding section keeps
  ownership of header drag, resize, workspace shortcuts outside the editor, and canvas gestures
  that begin outside it.
- Match main's applicable editor typography, syntax colors, gutters, active-line treatment,
  overflow, and compact behavior in light and dark appearances.
- Keep implicit autocomplete off. Any package-provided completion behavior must be explicitly
  configured and deterministic; no host or backend completion protocol is part of this milestone.

Do not add execution, run buttons, terminals, LSP, diagnostics, generated-code regions, file sync,
project search, or backend calls.

### D3. Public registration and composition

Export stable kind IDs, typed data/configuration contracts, and registration helpers for both
sections.

- The helpers compose with host section registrations without hidden global state or reserved
  application concepts.
- Hosts can customize labels, icons, creation defaults, allowed languages or formats, and whether
  each section appears in host creation UI.
- Omission leaves the package bundle and workspace behavior coherent; documents containing an
  unregistered kind continue to fail through the existing explicit unknown-kind contract.
- Public exports do not expose workspace stores, private selectors, XYFlow internals, or main's
  application section implementations.

### D4. Milestone D acceptance gate

Implement D1–D3 as reviewable batches, then present one live developer gate covering:

- text and Markdown creation, editing, rendering, mode switching, locking, and reload;
- representative headings, links, lists, tables, task lists, inline and fenced code, math, long
  lines, and empty content;
- every supported Code Editor language, wrapping, line numbers, indentation, read-only behavior,
  cursor/selection retention, undo/redo, and reload;
- section drag versus editor selection, nested and bounded-group overflow, wheel/pan ownership,
  resize, Outline, Inspector, context menu, quick help, and keyboard shortcuts;
- opt-in registration, host-customized defaults and choices, and omission of either built-in;
- matched main-branch visual comparison for behavior main implements; and
- light/dark appearance, RTL, 200% scale, coarse pointer, and a 320 px host.

Only after explicit developer acceptance may the loop record baselines, complete the milestone
audit, and request the final whole-plan UX audit.

## UX contracts for every milestone

- Preserve the accepted Setta visual language; do not redesign controls or modernize spacing while
  extracting behavior.
- Sections continue to drag from any non-interactive part of their surface. Selection never changes
  geometry.
- Compact visible controls retain adequately sized hit targets.
- Interaction ownership remains explicit across section drag, item drag, resize, pan, wheel,
  browser-history gestures, native controls, editors, menus, and panes.
- Canonical operations validate the entire request before one atomic change and one notification.
- Package-only behavior receives explicit design approval and is not mislabeled as main parity.
- New built-in behavior is batteries-included, while host customization uses narrow typed public
  inputs.
- No milestone adds backward compatibility, legacy support, migrations, transitional code,
  aliases, dual behavior paths, compatibility shims, heuristic fallbacks, broad catches, or
  backend/application concepts.

## Loop execution and evidence

For each implementation batch:

1. reproduce and characterize the applicable frozen-main behavior;
2. record any required package-only design decision before implementation;
3. implement the smallest coherent vertical slice;
4. add focused tests for observable pointer, keyboard, focus, document, and interaction behavior;
5. run the repository's authorized changed-file checks;
6. update the current milestone's status sentence in the same implementation commit, checking its
   top-level box only after acceptance and audit; and
7. continue until the milestone's repository work is ready for its developer gate.

At each developer gate:

1. compare the package and applicable main states at matched viewport, appearance, zoom, and data;
2. present a short test checklist and side-by-side visual or interaction evidence;
3. avoid repeatedly foregrounding Chrome while evidence is being prepared;
4. stop the loop with `PLAN_IMPLEMENTATION_AWAITING_DEVELOPER_APPROVAL`;
5. after explicit acceptance, record the approved baseline and run the authorized milestone audit;
   and
6. restart the loop to begin the next milestone.

Baselines protect accepted output; they never approve an unreviewed design. Agents and automated
tests cannot waive a developer gate.

## Stop conditions

Stop and return to the developer instead of broadening scope when:

- the frozen reference and proposed UX materially disagree;
- a required state is absent from main and lacks explicit package-design authority;
- the behavior requires application/backend state without a narrow public host seam;
- placement, type, or capability would require a heuristic rather than an explicit contract;
- a dependency or fork substitution would change drag, resize, zoom, nesting, or gesture feel;
- a batch becomes too large for meaningful live comparison;
- the implementation reaches a required developer acceptance gate; or
- automated checks pass while the live result remains visibly or behaviorally wrong.

Do not respond to a failed UX gate by adding unrelated features, broad fallbacks, abstractions,
snapshots, or performance instrumentation.

## Definition of UX completion

This plan is complete when:

- Milestones A, B, C, and D are implemented in order;
- each milestone has explicit developer visual and interaction acceptance;
- approved outputs are baseline-locked only after acceptance;
- the final audit confirms one consistent operation path across menus, Inspector, keyboard, and
  toolbars;
- nested, compact, accessible, RTL, scaled, and gesture-ownership behavior remains coherent; and
- no application/backend feature, publishing decision, or non-UX maintenance work was folded into
  the implementation.
