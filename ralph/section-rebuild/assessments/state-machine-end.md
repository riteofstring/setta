# StateMachineEnd Prototype Assessment

## Functionality

- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/state_machine.go`,
  `internal/projectstate/state_machine_test.go`,
  `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`,
  `frontend/src/components/Section/Layouts/stateMachineNodePresentation.ts`,
  `frontend/src/components/Section/Container/StateMachineEdgeHandles.tsx`,
  `frontend/src/components/Section/Container/StateMachineEdgeHandles.test.tsx`,
  and focused StateMachine node tests.
- Data shown maps to real StateMachineEnd data: section label/title,
  `machineGroupId`, the End node kind, and the target-side workflow handle
  identifiers.
- Controls/actions: the real End node has no Start, Stop, or Reset run
  controls. It also does not render the machine status/activity region in
  `StateMachineNodeArea`. The prototype may keep the shared prototype-only
  titlebar controls but must not add End-local run buttons.
- Important states: configured label and machine group, default label `End`,
  missing or mismatched workflow graph warnings through the shared node header,
  and terminal incoming-edge state. The prototype fixture uses a configured
  terminal label so identity and target edge affordances are visible.
- Interactions that must stay recognizable: an End node accepts incoming
  workflow edges through the left target handle, supports reverse edge creation
  from that target side, and does not emit outgoing workflow edges.

## Layout Invariants

- Conceptual regions and ordering: flat section titlebar first, then an End
  body focused on terminal identity and incoming workflow edge affordance.
- Relative placement of important controls: no run controls appear in the End
  body; the terminal identity stays separate from the target edge affordance.
- Grouping/containment relationships: End kind, label, and machine group remain
  grouped as identity data. The workflow target handle is anchored on the left
  side and remains separate from identity content.
- Scroll or overflow expectations: the End body is compact and non-scrolling in
  the primary fixture, matching the production node's lack of status/activity
  content. Long label or machine group text should truncate without changing
  the shell.

## Intentional Differences

- The flat prototype may replace old rounded/shadowed production node chrome
  with the accepted flat shell, monospace rhythm, and subtle section bands
  established by Callable and Param Dict/Dict.
- Production layout logic intentionally not reused: Tailwind class chains,
  rounded card structure, state hooks, measurement hooks, floating box handlers,
  and xyflow handle DOM are not copied into the prototype.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element is backed by the real
  StateMachineEnd contract, node identity behavior, or workflow edge handle
  behavior.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: title/label, `End` kind, machine group, left
  `workflow-target`, reverse-start metadata, and the absence of a right-side
  `workflow-source` or run buttons all map to inspected source.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task adds a new prototype only and does not redesign their
  layout, fixtures, controls, ports, row hierarchy, or rhythm.

## Component Plan

- New files or functions: add `FlatStateMachineEndSectionPrototype` and a small
  prototype-only StateMachineEnd body helper in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
- Static fixture data: title/label `Done`, machine group `workflow-main`, End
  kind, and a left target-side workflow affordance with reverse-start metadata.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert StateMachineEnd affordances, absence of run controls/outgoing source,
  and continued isolation from Callable and Param Dict/Dict baselines.
