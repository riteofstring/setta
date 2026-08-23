# Python Canvas Contextual Right-Pane Composition Plan

## Status and purpose

**Status: Implemented.**

Replace Python Canvas's mandatory generic Inspector with a main-style, application-composed right
pane. Preserve `@setta/workspace` as the owner of reusable section and typed-item editing, while
letting Python Canvas decide which tabs exist, when they apply, and which Python-specific facts they
show.

This is the only active plan in `docs/plans`. The completed side-pane integration plan and earlier
Python Canvas plans remain in Git history rather than competing with the current objective.

## Product outcome

The existing trailing rail, pane sizing, resizing, full-width behavior, focus behavior, narrow-host
negotiation, and persisted view state remain unchanged. The right rail changes from one generic
**Inspector** tab to a main-style contextual editor:

- **Section** uses the main settings icon and exposes the useful workspace-owned properties of the
  selected section.
- **Params** uses the main parameter-configuration icon and is enabled only when the selected Python
  callable has provider-backed parameter metadata to inspect.

With no selected section, the open pane shows main's large edit-glyph empty state. Selecting an item
keeps its owning section as the Section-tab target. Changing the selected section updates pane
content without closing the pane, resetting its width, moving the canvas, or mutating the project.

The result must look and behave like part of the existing main-derived pane system. Do not introduce
unstyled forms, generic browser buttons, a second pane surface, or a nested card-heavy settings UI.

## Product reference and fixed decisions

Use these sources in descending order of authority:

1. the behavior agreed in this plan;
2. `main:frontend/src/components/Panes/UiEditor/UiEditor.tsx`, `SectionConfig`, and `UIConfig` for
   rail hierarchy, title treatment, contextual availability, scrolling, spacing, and empty states;
3. the existing `@setta/workspace` shell and accepted workspace-shell evidence for pane mechanics;
4. current Python Canvas section behavior for canonical Python mutations and diagnostics.

The following decisions are fixed:

- Direct manipulation remains primary. The Section tab duplicates a property only when it adds a
  stable editing location, exact input, batch clarity, or better discoverability.
- Keep section name editing as a stable fallback; keep exact size, appearance, lock state, and
  group-only layout controls.
- Do not duplicate minimize/expand in the pane. The section-header control remains authoritative.
- Do not duplicate add, remove-last, or delete-selected parameter actions in Section settings.
- Do not synthesize `WorkspaceItem.presentation` for Python callable or dictionary items. Python's
  backend contract has no UI-type/configuration persistence, so the main branch's UI-type chooser
  cannot be ported honestly in this batch.
- Do not port variants, views, info Markdown, quick-info authoring, ports/connections, workflow-edge
  settings, project settings, or any backend schema merely to populate the rail.

## Ownership and architecture

### Workspace package

`@setta/workspace` continues to own:

- the section document fields and their mutation funnels;
- typed item presentation, validation, mutation, and configuration editors;
- selection projection, capability checks, status announcements, focus restoration, and the
  main-derived pane shell;
- the built-in generic Inspector for hosts that deliberately choose it.

Make the built-in trailing Inspector an explicit shell option instead of an unavoidable prepended
tab. Omitting it must leave host trailing tabs as the complete trailing rail, with the same tab,
focus, resizing, and state validation behavior. Existing hosts that choose the built-in Inspector
retain one authoritative instance; no compatibility alias or duplicate hidden Inspector is added.

Extract the reusable selected-section editor from the monolithic Inspector as a public package
component. It must resolve an item selection to its owning section and render:

- identity and editable section name;
- exact authored/resolved size;
- style and tag appearance controls;
- a clearly labelled position/size lock control;
- orientation and bounded-overflow controls only for groups; and
- package/section-kind contributions in their existing typed boundary.

The component excludes minimize and parameter-authoring commands. The existing built-in Inspector
may compose this section editor with its typed-item branch, but must not duplicate either editor.

### Python Canvas

Python Canvas owns the trailing-tab definitions and passes them to `WorkspaceShell` while opting out
of the generic Inspector tab. Keep the definitions and icons stable across renders so section
selection does not remount the shell or canvas.

Add a selection-aware wrapper below `WorkspaceProvider` that:

- renders the exported workspace Section editor in the **Section** tab;
- renders a Python-owned **Params** pane for the sole selected callable;
- keeps Params unavailable for generated code, lists, parameter dictionaries, pending sections,
  callables without resolved provider parameters, and ambiguous multi-selection; and
- returns to Section when a selected Params tab becomes unavailable, publishing one ordinary shell
  view-state change rather than leaving an active disabled tab.

The Params pane is an inspection surface, not a second parameter-row editor. It uses a main-style
filter and one compact group per resolved parameter, showing the existing canonical metadata:

- parameter name;
- type annotation when present;
- passing style;
- provider default when present; and
- provider order.

Do not repeat the authored expression editor in the pane. Parameter values remain edited in the
section, while the pane explains the provider-backed signature information that the compact row does
not expose.

### Shell tab availability

Extend the generic tab definition only as much as required for main-style disabled tabs. Disabled
tabs:

- remain visible with the package's existing disabled rail treatment;
- cannot be pointer- or keyboard-activated;
- are skipped by roving Arrow/Home/End navigation;
- expose their unavailable state semantically; and
- cannot remain the selected tab after host context makes them unavailable when another enabled tab
  exists.

Keep this availability contract generic. The workspace package must not import Python section kinds
or decide when Python parameters exist.

## Presentation

- Reuse the pane's existing title shell, scrollbar treatment, palette, and spacing tokens.
- Match main's 40 px rail, icon scale/weight, active blue, inactive muted color, and disabled faded
  state. Use one outline icon family/state treatment on this rail.
- Section settings use progressive disclosure: the primary settings group precedes Appearance;
  group-only controls do not reserve empty space on ordinary sections.
- Group related fields with space and quiet background surfaces rather than a divider after every
  row. All fields share the pane's leading edge and use logical inline properties.
- Pane content owns vertical scrolling; neither tab creates page-level overflow or captures canvas
  pan/wheel input outside its surface.
- Do not add routine entrance animation. Existing pane transitions remain interruptible and are the
  only motion in this interaction.

## Preference cutover

Bump the Python Canvas shell-preference schema because the canonical trailing tab id changes from
`inspector` to `section-settings`. New defaults keep the trailing pane closed at the existing 500 px
width with Section selected. Treat the previous preference version atomically as stale and fall back
to the new defaults; do not add a migration or dual decoder.

## Acceptance behavior

1. Python Canvas initially shows the existing closed 40 px trailing rail with Section and Params
   icons; Section is the selected default and the pane retains its 500 px remembered width.
2. Opening Section with no selection shows the main-style empty state. Selecting a section or one of
   its items updates the pane to that owning section without remounting the workspace.
3. Section settings edit name, exact size, appearance, lock state, and group-only layout through the
   existing workspace mutation funnels. Minimize and parameter-authoring actions are absent.
4. A callable with resolved parameters enables Params. The pane shows a filterable, compact list of
   provider metadata and never duplicates the parameter expression inputs.
5. Sections without resolved callable parameters leave Params visibly disabled. Moving from an
   available Params context to an unavailable section selects Section exactly once and preserves
   pane visibility and width.
6. Disabled tabs reject pointer activation and are skipped by Arrow/Home/End. Rail/tab/panel ARIA,
   pane close focus restoration, Escape behavior, and status announcements remain valid.
7. Opening, closing, switching, filtering, or resizing right-pane tabs issues no Python backend
   request and does not change `project.json`, generated Python, diagnostics, section geometry, or
   terminal state.
8. The package playground's built-in Inspector remains available exactly once and its typed item
   configuration path continues to work.
9. At the wide reference viewport, compact 320 px host, effective 200% scale, and RTL, the rail and
   content remain reachable without clipped critical controls or page-level horizontal overflow.
10. Raw-headless production acceptance confirms the visible rail, empty state, section settings,
    callable Params enablement/filtering, disabled transition, preference reload, and absence of
    canvas remount or backend traffic. Automation must not launch the user's Chrome profile or touch
    the macOS keychain.

## Focused verification

- Workspace unit/component tests for optional built-in Inspector composition, disabled-tab
  activation/navigation/selection normalization, selected-item-to-owning-section projection, and
  the reduced Section editor control set.
- Python Canvas preference tests for the new default tab id, version cutover, valid round trip, and
  atomic rejection of the prior schema.
- Python Canvas component tests for stable tab definitions, selection-aware Params availability,
  metadata rendering/filtering, and no duplicate parameter expression editor.
- Focused workspace and Python Canvas builds/tests, followed near completion by
  `code-policy test --changed` inside the caller's single task session.
- Raw-headless production comparison against the checked-in main/workspace reference evidence; no
  headed browser and no user-profile browser process.

## Implementation checklist

- [x] Make the built-in Inspector optional without weakening shell invariants.
- [x] Add generic disabled-tab behavior and tests.
- [x] Extract and export the reusable reduced Section settings editor.
- [x] Compose the built-in Inspector from the reusable editors without duplication.
- [x] Add Python Canvas Section and Params tabs plus contextual availability.
- [x] Cut over Python Canvas shell preferences atomically.
- [x] Add focused and raw-headless acceptance coverage.
- [x] Record completed verification and mark this plan implemented.

## Implementation evidence

- The workspace shell/Inspector/public-API focus set passes: 48 tests across the three affected
  files, and both workspace and Python Canvas production builds pass.
- Python Canvas's complete focused suite passes: 112 Vitest tests plus 26 launcher/browser-process
  tests. The backend, playground, and workspace-focused suites selected by
  `code-policy test --changed` also pass.
- The policy command still exits nonzero only because six checked-in vulnerability assessments
  expired on 2026-08-24; this batch does not alter dependency or policy governance.
- The raw-headless production side-pane scenario passes against an isolated Playwright-cached
  `chrome-headless-shell`, including Section/Params presentation, contextual availability,
  filtering, preference reload, narrow layout, and absence of project mutations. A complete
  vertical-slice run continued past this scenario and later encountered the pre-existing terminal
  scroll-timeout assertion, outside this plan's right-pane scope.
