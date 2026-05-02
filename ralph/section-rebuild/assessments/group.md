# Group Prototype Assessment

## Functionality

- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/top_level_section_creation.go`,
  `internal/projectstate/child_defaults.go`,
  `internal/projectstate/layout_presentation.go`,
  `internal/projectstate/layout_presentation_test.go`,
  `internal/projectstate/section_structure_selection_test.go`,
  `frontend/src/state/actions/uiTypes/utils.ts`,
  `frontend/src/components/Section/Container/ContainerCore.tsx`,
  `frontend/src/components/Section/Container/ManyNestedSections.tsx`,
  `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`,
  `frontend/src/components/Section/Header/ChangeOrientationButton.tsx`,
  `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`,
  `frontend/src/components/Section/Header/MenuButton/ToggleGroupOverflowMode.tsx`,
  `frontend/src/components/Section/Header/MenuButton/UngroupButton.tsx`,
  `frontend/src/components/Section/SectionParts/Incrementer.tsx`, and
  `frontend/src/components/Panes/UiEditor/SectionConfig/ChildDefaultsSettings.tsx`.
- Data shown maps to real Group data: section name/title, `children`,
  `defaultChildSectionType`, `isHorizontalOrientation`, and `overflowMode`.
- Controls/actions: Group has a section type/menu affordance, title, orientation
  toggle, lock/delete controls, overflow-mode menu action, ungroup menu action,
  and root child incrementer controls that add/remove children using the
  configured default child section type.
- Important states: empty versus populated child container, vertical versus
  horizontal orientation, overflow mode on/off, locked versus unlocked position,
  frozen/share-disabled child editing, and default child section type. The
  primary fixture uses populated children with horizontal orientation and
  overflow mode enabled so the container and scroll relationship are visible.
- Interactions that must stay recognizable: toggling group orientation,
  toggling overflow mode, ungrouping, adding/removing child sections, changing
  the default child section type, and drag/sort-oriented child containment. The
  prototype represents these as static HTML controls and state indicators; it
  does not implement behavior.

## Layout Invariants

- Conceptual regions and ordering: flat section titlebar first, then compact
  group-level layout/actions, then child incrementer controls, then the nested
  child-section containment region.
- Relative placement of important controls: orientation, overflow, default
  child type, and ungroup remain grouped as parent/group controls, while
  child-count add/remove controls stay close to the child collection.
- Grouping/containment relationships: child sections remain visibly contained
  inside the Group body and keep compact section type/name identities. The
  horizontal fixture uses a row of sortable child cards because production
  `ManyNestedSections` switches group children to a row when
  `isHorizontalOrientation` is true.
- Scroll or overflow expectations: overflow mode constrains the group content,
  and horizontal orientation may create horizontal child overflow. The Group
  prototype should be a compact container, not a row-heavy Callable/Dict body.

## Intentional Differences

- The flat prototype may replace the old rounded production group outline,
  Tailwind surface treatment, and popover/menu styling with the accepted flat
  shell, monospace rhythm, and subtle separators.
- Production layout logic intentionally not reused: DnD wrappers, Zustand
  selectors, OpenAPI calls, resize/scroll hooks, absolute outline DOM,
  `SortableSectionContainer`, popover/menu components, icon components, and
  Tailwind class chains are not copied.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element is backed by the real Group
  contract, parent-child/default-child behavior, layout mutation behavior, or
  group structure mutation behavior.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: title/name, children, child count, add/remove controls,
  default child type, orientation state/options, overflow mode, ungroup action,
  and nested child cards all map to inspected source.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task adds a new Group prototype only and does not redesign
  their layout, fixtures, controls, ports, row hierarchy, or rhythm.

## Component Plan

- New files or functions: add `FlatGroupSectionPrototype` and Group-only
  prototype body helpers in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
- Static fixture data: title `Prototype Group`, default child type `Callable`,
  horizontal orientation selected, overflow mode on, child count `3`, and three
  child fixture entries with real section type labels.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert Group affordances, gallery presence, compact CSS/overflow behavior, no
  workflow handles/ports/ListRoot state, and continued isolation from Callable
  and Param Dict/Dict baselines.
