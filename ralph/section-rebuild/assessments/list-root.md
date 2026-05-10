# ListRoot Prototype Assessment

## Functionality

- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/child_defaults.go`,
  `internal/projectstate/top_level_section_creation.go`,
  `internal/projectview/child_defaults_frontend_ui.go`,
  `internal/projectstate/auto_layout.go`,
  `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`,
  `frontend/src/components/Section/Container/ManyNestedSections.tsx`,
  `frontend/src/components/Section/SectionParts/Incrementer.tsx`, and
  `frontend/src/components/Panes/UiEditor/SectionConfig/ChildDefaultsSettings.tsx`.
- Data shown maps to real ListRoot data: section name/title, `children`,
  `defaultChildSectionType`, and `viewMode`.
- Controls/actions: ListRoot has root child incrementer controls for choosing a
  child count and adding/removing child sections using `defaultChildSectionType`.
  It also has settings for default child section type and list-root view mode.
- Important states: default child section type, child count, selected view mode
  (`default`, `task_list`, or `kanban`), frozen/structure-edit-disabled state,
  and an empty or populated child list. The primary fixture uses populated
  children with `kanban` selected so the horizontal child layout relationship is
  visible.
- Interactions that must stay recognizable: adding/removing children,
  switching list-root view mode, changing the default child section type, and
  drag/sort-oriented child organization. The prototype represents these as
  static HTML controls and child cards; it does not implement behavior.

## Layout Invariants

- Conceptual regions and ordering: flat section titlebar first, then a compact
  child management strip, then the child layout region.
- Relative placement of important controls: child count and add/remove controls
  stay near the child collection label, while default child type and view mode
  stay grouped as parent configuration/state.
- Grouping/containment relationships: child sections remain visually contained
  under the ListRoot parent and each child keeps a compact section-type/name
  identity. The kanban fixture uses a horizontal child row because production
  treats `viewMode === "kanban"` as horizontal orientation.
- Scroll or overflow expectations: the child layout may overflow horizontally
  in kanban mode. The root shell itself stays compact and should not inherit the
  row-heavy Callable/Dict minimum height.

## Intentional Differences

- The flat prototype may replace the old rounded production chrome, Tailwind
  surface treatment, and popover styling with the accepted flat shell,
  monospace rhythm, and subtle separators.
- Production layout logic intentionally not reused: DnD wrappers, Zustand
  selectors, OpenAPI calls, Tailwind class chains, margin rail DOM, and
  `SortableSectionContainer` composition are not copied.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element is backed by the real ListRoot
  contract, child-default settings, incrementer behavior, or nested child
  layout behavior.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: title/name, children, child count, add/remove controls,
  default child type, view mode options, selected kanban state, and horizontal
  child cards all map to inspected source.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task adds a new ListRoot prototype only and does not redesign
  their layout, fixtures, controls, ports, row hierarchy, or rhythm.

## Component Plan

- New files or functions: add `FlatListRootSectionPrototype` and ListRoot-only
  prototype body helpers in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
- Static fixture data: title `Sprint Intake`, default child type `Callable`,
  selected `Kanban Board` view mode, child count `3`, and three child fixture
  entries with real section type labels.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert ListRoot affordances, gallery presence, compact CSS, no workflow
  handles/ports, and continued isolation from Callable and Param Dict/Dict
  baselines.
