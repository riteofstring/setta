# GlobalVariables Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/frontend_section_variant_contracts.go`,
  `internal/projectstate/top_level_section_creation.go`,
  `internal/projectstate/effective_section_payload.go`,
  `internal/projectstate/add_kwarg_test.go`,
  `internal/projectstate/delete_selected_params.go`,
  `internal/projectstate/edge_io_test.go`,
  `internal/projectstate/auto_layout.go`,
  `internal/settingsstate/defaults.json`,
  `internal/codegen/python_dependency_graph.go`,
  `internal/codegen/python_dependency_graph_test.go`,
  `frontend/src/components/Section/Layouts/GlobalVariablesArea.tsx`,
  `frontend/src/components/Section/Layouts/DictArea.tsx`,
  `frontend/src/components/Section/SectionParts/KwargsControls.tsx`,
  `frontend/src/components/Params/GroupContainer.tsx`,
  `frontend/src/components/Section/Header/SectionTitle.tsx`,
  `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`,
  `frontend/src/components/Section/Header/HeaderIcon.tsx`, and
  `frontend/src/forks/dnd-kit/useDropType.ts`.
- Data shown: fixed section name `Global Variables`, singleton section identity,
  `topLevelParamId`, top-level Python export behavior, selected/pinned/edge
  input param state, and a small nested param tree with real param code object
  types.
- Controls/actions: standard section titlebar controls, section type/menu
  affordance, Dict-style kwargs controls for add/remove arg, pin/unpin selected,
  convert selected params to edge inputs or back to params, delete selected
  editable params, and filter params.
- Important states: the section is a singleton, title editing is disabled for
  `GlobalVariables`, defaults reuse Dict section defaults, `topLevelParamId`
  identifies the global param root, params export directly at Python top level
  without a section wrapper, and dragging the singleton section is rejected.
- Interactions that must stay recognizable: managing global variable params,
  filtering the param tree, distinguishing pinned params from unpinned params,
  recognizing edge-input params, and seeing that global params are exported as
  top-level variables rather than as a nested section node.

## Layout Invariants
- Conceptual regions and ordering: external preview label above the prototype,
  shared flat section titlebar, compact GlobalVariables status/control band,
  pinned params, then the scrollable unpinned/nested param rows.
- Relative placement of important controls: kwargs add/remove/pin/edge/delete
  controls and filter stay above the param tree, matching the production
  `GlobalVariablesArea` ordering of `KwargsControls` before
  `ParamGroupContainer`.
- Grouping/containment relationships: global params remain inside one section
  body with a top-level root and nested children; it is not a child-container,
  workflow node, media preview, code editor, or plugin surface.
- Scroll or overflow expectations: GlobalVariables shares Dict minimum sizing
  of 200x78 and should stay compact and row-oriented. The prototype can be
  taller than the minimum to show the singleton/status band and row examples,
  but should not inherit unused 320px empty body space.

## Intentional Differences
- What the flat prototype is allowed to change: the old kwargs toolbar and param
  rows can be expressed as static flat HTML/CSS controls and rows; singleton and
  top-level export metadata can be shown as compact status chips.
- What production layout logic is intentionally not reused: no
  `ParamDndContext`, `ParamGroupContainer`, `EdgesStrip`, Zustand selectors,
  ResizeObserver height wiring, OpenAPI mutation handlers, Tailwind class
  chains, DnD collision logic, or production param row DOM are copied.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element maps to the real
  `GlobalVariables` contract, Dict-shaped defaults, kwargs controls, singleton
  state, fixed title behavior, edge-input support, or top-level codegen export.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: fixed title, singleton chip, `topLevelParamId`, top-level
  export chip, add/remove/pin/edge/delete/filter controls, pinned row, edge row,
  unpinned nested rows, selected state, and param code object types all map to
  inspected source behavior.
- Confirmation that the required section-type label is external page/gallery
  chrome and not part of the section body, shell, titlebar, toolbar, controls,
  or reusable section layout component.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task will add GlobalVariables-only functions, fixtures, styles,
  tests, and gallery entries. It will not alter Callable or Dict fixtures, body
  structure, controls, row hierarchy, ports, or accepted CSS.

## Component Plan
- New files or functions: add `FlatGlobalVariablesSectionPrototype`,
  GlobalVariables fixture data, GlobalVariables-specific body helpers, a
  GlobalVariables section icon glyph, and dark/light gallery entries in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
- Static fixture data: title `Global Variables`, singleton id
  `global-variables`, `topLevelParamId` `global-root`, selected param
  `api_token`, pinned param `workspace_id`, edge-input param `api_token`, nested
  runtime params `environment` and `retry_limit`, and Python export mode
  `top-level`.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert GlobalVariables gallery labels, singleton/top-level export metadata,
  kwargs controls, pinned/edge/nested param rows, compact CSS, absence of
  child/workflow/media affordances, and continued Callable/Dict isolation; run
  focused Vitest, formatting, `git diff --check`, and CDP visual verification
  on `/internal/flat-section-prototype`.
