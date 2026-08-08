# GenPythonCode Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/frontend_section_variant_contracts.go`,
  `internal/projectstate/python_codegen.go`,
  `internal/codegen/python_code_renderer.go`,
  `internal/codegen/python_materializer.go`,
  `internal/projectstate/project_lifecycle_test.go`,
  `frontend/src/components/Section/Layouts/CodeArea.tsx`,
  `frontend/src/components/Section/Header/SectionHeader.tsx`,
  `frontend/src/components/Section/Header/RunButton.tsx`,
  `frontend/src/components/Section/Header/ToggleEntryCodeBlockButton.tsx`,
  `frontend/src/components/Section/Header/AttachedTerminalControls.tsx`,
  `frontend/src/components/Section/Header/HeaderIcon.tsx`,
  `frontend/src/state/actions/codeUpdates.ts`, and
  `frontend/src/utils/runCapabilities.ts`.
- Data shown: fixed generated section name, `GenPythonCode` identity,
  Python language, generated code file binding path/access mode/autobinding
  state, project codegen prefix, generated read-only body, project codegen
  suffix, generated-code diagnostics, run/entry capability state, and optional
  attached terminal child state.
- Controls/actions: standard section titlebar controls, section type/menu
  affordance, run-this-code control, toggle entry code block control, attached
  terminal create/show/hide control, generated-code diagnostics affordance, and
  editable prefix/suffix editor zones around the generated read-only code.
- Important states: the section exists only when the project has a Python
  codegen target, disabled rendering returns no body, `GenPythonCode` reuses the
  canonical Code section shape while preserving a distinct section type, the
  generated block is read-only, prefix/suffix edits update the project codegen
  target instead of the generated body, deployment/share mode makes editing
  read-only, generated diagnostics are stored in `unmappedGenCode`, and the
  generated file binding is write-only with `autoBinding: false`.
- Interactions that must stay recognizable: editing only import/setup prefix
  and execution suffix text, seeing the generated body as protected output,
  running the generated entry section, selecting it as the entry code block,
  reviewing generated-code issues, and toggling an attached terminal.

## Layout Invariants
- Conceptual regions and ordering: external preview label above the prototype,
  shared flat section titlebar with generated-code run/entry/terminal/diagnostic
  actions, compact binding/status strip, then a single CodeMirror-like document
  split into prefix, generated read-only, and suffix regions.
- Relative placement of important controls: run, entry, terminal, diagnostics,
  and generic section controls stay in the titlebar/control area; generated file
  binding metadata stays above the editor because it configures the generated
  artifact; the generated block remains visually between editable prefix and
  suffix regions.
- Grouping/containment relationships: the editor is the dominant body region;
  prefix and suffix are editable siblings of the protected generated body;
  diagnostics summarize generated-code issues, and an attached terminal is
  represented as a related child affordance, not as a full Terminal prototype.
- Scroll or overflow expectations: `GenPythonCode` defaults to a compact code
  section size but can be editor-oriented. The prototype should be tall enough
  to show the three document zones and generated status without unmapped empty
  space, and the code document itself should be scrollable.

## Intentional Differences
- What the flat prototype is allowed to change: live CodeMirror behavior,
  transaction filters, LSP completions, decorations, popovers, and backend
  mutation handlers can be represented by static flat HTML/CSS regions that
  preserve the affordances and hierarchy.
- What production layout logic is intentionally not reused: no CodeMirror
  component tree, `EditorState.transactionFilter`, decoration plugins,
  completion callbacks, Zustand selectors, ResizeObserver height wiring, React
  Flow visibility hooks, OpenAPI mutation handlers, Tailwind class chains,
  attached-terminal DOM, or production header DOM are copied.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible GenPythonCode-specific element maps to the generated
  Code contract, Python codegen target fields, generated section materializer,
  read-only generated CodeArea behavior, generated diagnostics, run
  capabilities, or base-code attached terminal semantics.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: generated section title, `GenPythonCode` type, Python
  language, write-only `setta_gen.py` binding, `autoBinding: false`, prefix
  imports, generated `SettaState` body, default suffix, read-only generated
  marker, run button, entry flag, terminal toggle, and generated diagnostics
  all map to inspected source behavior.
- Confirmation that the required section-type label is external page/gallery
  chrome and not part of the section body, shell, titlebar, toolbar, controls,
  or reusable section layout component.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task will add GenPythonCode-only functions, fixtures, styles,
  tests, and gallery entries. It will not alter Callable or Dict fixtures, body
  structure, controls, row hierarchy, ports, or accepted CSS.

## Component Plan
- New files or functions: add `FlatGenPythonCodeSectionPrototype`,
  GenPythonCode fixture data, GenPythonCode-specific header actions and body
  helpers, generated editor region styles, and dark/light gallery entries in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
- Static fixture data: title `Generated Python Code`, file binding
  `code/sections/alpha/setta_gen.py`, access mode `write_only`,
  `autoBinding: false`, prefix `import math`, generated `SettaState` lines,
  suffix `state = SettaState()`, generated diagnostics count `1`, entry/run
  enabled, and attached terminal `terminal-gen-python`.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert GenPythonCode gallery labels, titlebar actions, generated binding
  metadata, prefix/generated/suffix editor zones, read-only marker,
  generated diagnostics, attached terminal state, absence of param row groups
  and workflow/media affordances, and continued Callable/Dict isolation; run
  focused Vitest, formatting, `git diff --check`, and CDP visual verification
  on `/internal/flat-section-prototype`.
