# Python Canvas Side-Pane Parity Plan

## Status and purpose

**Status: Planned.**

Add the useful leading and trailing pane experience from `main` to Python Canvas without importing
the unrelated product systems that happen to occupy those panes on `main`. The leading pane gives
users a navigable outline of the canvas hierarchy. The trailing pane gives users an inspector for
the selected section or item. Both panes retain main's rail, resize, full-width, focus, canvas-inset,
and narrow-viewport behavior.

This is the only active plan in `docs/plans`. Completed parser-ordering, callable, collection,
diagnostic, terminal, and performance plans remain in Git history rather than competing with the
current objective.

## Product outcome

Python Canvas opens as a three-region workspace shell:

- a visible 335 px leading **Outline** pane with its 40 px icon rail;
- the existing canvas in the center; and
- a closed 40 px trailing **Inspector** rail whose pane opens at 500 px.

The outline reflects the current section tree and lets the user focus sections. The inspector
reflects the current selection and exposes only configuration already supported by the workspace
host and registered Python Canvas section kinds. Pane operations are immediate local UI changes:
they do not mutate `project.json`, call the backend, clear diagnostics, recreate the workspace host,
or remount canvas sections.

Pane visibility, selected tabs, widths, remembered non-full widths, and outline disclosure state
survive a browser reload as versioned local UI preferences. An absent or invalid preference uses
the package defaults and is replaced only after it has been validated at the storage boundary.

## Main reference and fixed scope

Use `main`'s Overview/UiEditor shell behavior as the product reference and the existing
`@setta/workspace` `WorkspaceShell` implementation as the authoritative reusable implementation.
The package already captures main's relevant behavior:

- closed 40 px rails;
- 335 px leading and 500 px trailing defaults;
- 250 px leading and 425 px trailing minimums;
- pointer and keyboard resizing;
- hide/show and full-width restoration;
- opposite-pane reconciliation when both panes no longer fit;
- direction-aware leading/trailing placement;
- viewport insets and leading-pane canvas shifting; and
- built-in Outline and Inspector tabs.

Do not fork or restyle these mechanics in Python Canvas. Do not copy main's file browser, Git,
plugins, notifications, AI chat, run instructions, project variants, parameter UI configuration,
workflow-edge inspector, or view-mode tabs. Those depend on product systems outside the current
Python Canvas contract. Host-contributed tab arrays remain empty in this batch.

No `@setta/workspace` change is expected. If a focused acceptance check exposes a genuine generic
shell defect, stop and document the missing package contract instead of patching around it in the
application.

## Architecture

### Shell integration

Replace the direct `WorkspaceCanvas` render in `PythonCanvasView` with `WorkspaceShell`, inside the
existing `WorkspaceProvider` and Python-specific context providers. Keep the workspace host and
provider identity stable while pane state changes. Pass empty stable leading/trailing extension
arrays, leave `leadingPaneShiftsCanvas` enabled, and give the shell a Python Canvas-specific
accessible label.

The shell owns the visible canvas and its controls. Python Canvas continues to own only application
announcements, Python mutations, target completion, and attached-terminal state.

### UI preference boundary

Add one Python Canvas frontend module that owns the shell preference key, schema version, strict
validation, loading, and persistence. It is the single boundary for browser storage.

- Start from `createWorkspaceShellViewState()` when no valid value exists.
- Accept only the complete current schema with finite widths, valid booleans and strings, a nullable
  focused section ID, and a string-only collapsed-group list.
- Reject malformed JSON, stale versions, partial objects, non-finite values, and invalid selected
  built-in tab IDs as a whole; never merge untrusted fragments into defaults.
- Treat storage availability failures as unavailable persistence while keeping the valid in-memory
  state. Do not show an application error panel for a browser preference failure.
- Persist only after a shell-originated state change. Initial load must not overwrite storage merely
  because the view rendered.

The preference is browser-local presentation state. It must never enter the backend snapshot,
project revision, mutation queue, undo history, or generated Python.

### Selection and diagnostics

Use the package Outline and Inspector without adding a second selection model. Outline focus and
Inspector content must flow through the existing `WorkspaceHost` actions and document projection.
Opening, closing, or resizing panes must preserve section selection, item drafts, diagnostics,
terminal sessions, canvas geometry, and generated-code editor state.

## Acceptance behavior

1. On first load, Outline is visible at the package default width, Inspector is closed to its rail,
   and the canvas fills the remaining center region without a transient direct-canvas frame.
2. The Outline shows top-level and nested Python Canvas sections in document order. Activating an
   entry focuses the corresponding section through the existing workspace host.
3. Selecting a supported section or item and opening Inspector shows the package-owned inspector
   for that selection; no unsupported main-only controls or empty fake tabs appear.
4. Rail activation, pane close, pointer resize, keyboard resize, and full-width toggle behave like
   the package shell and main. Opening/resizing the leading pane shifts the canvas by its true-width
   delta; trailing-pane changes do not introduce an equivalent camera jump.
5. At widths where both minimum panes cannot fit, opening one closes the opposite pane. At larger
   widths, both may remain open. Rails and the center remain reachable without horizontal page
   scrolling or clipped critical controls.
6. A valid shell preference survives reload. Invalid JSON, a stale schema version, or an invalid
   shape falls back atomically to package defaults without crashing the app.
7. Pane-only interactions issue no project mutation request and do not change `project.json`, its
   revision, generated Python, current diagnostics, or section render identity.
8. Existing callable, dictionary, list, generated-code, terminal, and parser-ordering browser flows
   continue to pass with the shell present.
9. A production raw-headless acceptance flow verifies initial pane geometry, outline navigation,
   inspector selection, open/close, resize, narrow-width reconciliation, and reload persistence.
   Automation must use the repository's raw headless shell and must not launch the user's Chrome
   profile or access the macOS keychain.

## Focused verification

- Pure preference-boundary tests for valid round-trip state, missing storage, malformed JSON, stale
  version, partial state, invalid tab IDs, duplicate/non-string outline IDs, and storage exceptions.
- `PythonCanvasView` component tests proving `WorkspaceShell` receives controlled state, empty host
  tabs, enabled leading shift behavior, and a stable provider/host across pane changes.
- Existing `@setta/workspace` shell tests remain the proof for package-owned layout algorithms,
  keyboard behavior, RTL mapping, and generic Outline/Inspector semantics; do not duplicate those
  algorithms in application tests.
- Extend the existing Python Canvas production raw-headless suite with the end-to-end pane flow and
  assertions that pane-only operations create no backend project mutation.
- Run the Python Canvas frontend focused suite, browser suite, build, `code-policy test --changed`,
  and the policy-selected merge gate before merge.

## Implementation sequence

1. Add the versioned shell-preference boundary with focused observable tests.
2. Mount `WorkspaceShell` from `PythonCanvasView` with controlled state and stable empty extension
   tabs; update component tests without weakening existing announcement/error assertions.
3. Add the production raw-headless pane acceptance flow, including reload persistence and a
   no-project-mutation assertion.
4. Compare the rendered shell at large and constrained viewport widths with main and the package
   playground. Fix only Python Canvas integration defects; do not re-audit package internals.
5. Run changed-scope verification and the policy-selected merge gate.

Stop when the nine acceptance behaviors pass. Do not add new pane content systems, backend pane
state, project schema fields, workspace-package abstractions, generic storage frameworks, or
unrelated visual polish.

## Completion checklist

- [ ] Obsolete parser-ordering plan removed
- [ ] One validated, versioned local shell-preference boundary exists
- [ ] Python Canvas mounts the package `WorkspaceShell`
- [ ] Built-in Outline and Inspector work with Python Canvas sections
- [ ] Main-aligned defaults, resizing, canvas shift, and narrow-width behavior are verified
- [ ] Pane state survives reload without entering project state
- [ ] Pane-only changes preserve selections, diagnostics, editors, and terminal sessions
- [ ] Focused frontend and production raw-headless acceptance tests pass
- [ ] `code-policy test --changed` passes
- [ ] Policy-selected merge gate passes
