# Code Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/top_level_section_creation.go`,
  `internal/projectstate/base_code_sections.go`,
  `internal/projectstate/code_section_bindings.go`,
  `internal/projectstate/code_file_binding_writes.go`,
  `internal/projectstate/code_languages.go`,
  `internal/projectstate/run_graph.go`,
  `internal/projectstate/attached_terminal_writes.go`,
  `frontend/src/components/Section/Layouts/CodeArea.tsx`,
  `frontend/src/components/Section/Header/SectionHeader.tsx`,
  `frontend/src/components/Section/Header/RunButton.tsx`,
  `frontend/src/components/Section/Header/ToggleEntryCodeBlockButton.tsx`,
  `frontend/src/components/Section/Header/AttachedTerminalControls.tsx`,
  `frontend/src/components/Section/Header/HeaderIcon.tsx`,
  `frontend/src/components/Panes/UiEditor/SectionConfig/CodeAreaSettings.tsx`,
  `frontend/src/utils/runCapabilities.ts`, and
  `frontend/src/utils/codeLanguage.ts`.
- Data shown: section title, `Code` section identity, Python `codeLanguage`,
  editable code text, code file binding path/access mode/autobinding state,
  diagnostics mute/suppression state, run/entry capability state, and optional
  attached terminal child state.
- Controls/actions: standard section titlebar controls, section type/menu
  affordance, run-this-code control, toggle entry code block control, attached
  terminal create/show/hide control, diagnostics mute/problems affordance, file
  path and access mode settings, and the editable code editor surface.
- Important states: Python sections use Python-specific completion/LSP wiring,
  non-Python sections use the basic editor, deployment/frozen states make the
  editor read-only, preview code can temporarily replace persisted code,
  diagnostics are absent in deployment mode, file bindings can be automatic or
  manually set to read/write modes, and base code sections may own one embedded
  terminal child.
- Interactions that must stay recognizable: editing code in a CodeMirror-like
  region, running the section when `canRun` is true, selecting it as the manual
  entry code block, muting/reviewing diagnostics, updating the backing file
  binding, and toggling the attached terminal.

## Layout Invariants
- Conceptual regions and ordering: external preview label above the prototype,
  shared flat section titlebar with Code-specific run/entry/terminal/diagnostic
  actions, compact binding/status band, then the primary editor body.
- Relative placement of important controls: run, entry, terminal, diagnostics,
  and generic section controls stay in the titlebar/control area; file binding
  and access mode settings sit above the editor because they configure the code
  document rather than appearing as code lines.
- Grouping/containment relationships: the editor is the dominant body region;
  file binding metadata and diagnostics are supporting status/control regions;
  an attached terminal is represented as a related child affordance, not as a
  full Terminal prototype for this Code task.
- Scroll or overflow expectations: Code sections are editor-oriented and can be
  taller than compact sections. The prototype should show a scrollable editor
  body with line numbers and diagnostics while avoiding unmapped empty space.

## Intentional Differences
- What the flat prototype is allowed to change: the live CodeMirror editor,
  popovers, and settings controls can be represented by static flat HTML/CSS
  surfaces that preserve the affordances and relative hierarchy.
- What production layout logic is intentionally not reused: no CodeMirror
  component tree, CodeMirror extensions, LSP decoration plugins, Zustand
  selectors, ResizeObserver height wiring, React Flow visibility hooks,
  OpenAPI mutation handlers, Tailwind class chains, attached-terminal group
  DOM, or production header DOM are copied.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible Code-specific element maps to the real Code section
  contract, CodeArea behavior, section header controls, code binding settings,
  diagnostics controls, run capabilities, or base-code attached terminal
  semantics.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: Python language state, editable code text, file path,
  access mode, auto binding, run button, entry flag, terminal toggle,
  diagnostics mute/problems, suppressed diagnostic code, and editor line/issue
  markers all map to inspected source behavior.
- Confirmation that the required section-type label is external page/gallery
  chrome and not part of the section body, shell, titlebar, toolbar, controls,
  or reusable section layout component.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task will add Code-only functions, fixtures, styles, tests, and
  gallery entries. It will not alter Callable or Dict fixtures, body structure,
  controls, row hierarchy, ports, or accepted CSS.

## Component Plan
- New files or functions: add `FlatCodeSectionPrototype`, Code fixture data,
  Code-specific header action buttons, Code body helpers, Code icon styling if
  needed, and dark/light gallery entries in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
- Static fixture data: title `Manual Runner`, language `python`, file binding
  `code/sections/manual_runner.py`, read/write access, `autoBinding: true`,
  entry enabled, run enabled, attached terminal visible, two active diagnostics,
  one suppressed code, and a short Python function body.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert Code gallery labels, titlebar actions, binding/status metadata,
  diagnostics, editor lines, scrollable editor CSS, absence of param row groups
  and workflow/media affordances, and continued Callable/Dict isolation; run
  focused Vitest, formatting, `git diff --check`, and CDP visual verification
  on `/internal/flat-section-prototype`.
