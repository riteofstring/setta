# StateMachineGate Prototype Assessment

## Functionality

- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/state_machine.go`,
  `internal/statemachineruns/runtime.go`,
  `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`,
  `frontend/src/components/Section/Layouts/stateMachineNodePresentation.ts`,
  `frontend/src/components/Section/Container/StateMachineEdgeHandles.tsx`,
  `frontend/src/components/Panes/UiEditor/SectionConfig/StateMachineSectionSettings.tsx`,
  `frontend/src/state/actions/stateMachineDraftValidation.ts`, and focused
  StateMachine tests.
- Data shown maps to real StateMachineGate data and run presentation: section
  label/title, `machineGroupId`, `gateType`, machine run status, gate status,
  input progress from gate input and incoming edge counts, and recent gate
  activity.
- Controls/actions: the real gate node has no Start/Stop/Reset controls. Its
  editable settings are machine group, label, and gate type in the section
  config surface, while the section body presents read-only workflow state.
  The prototype may keep the shared prototype-only titlebar controls but must
  not add gate-local run buttons.
- Important states: idle/no-run, running, completed/failed/stopped machine
  status, gate waiting/satisfied/blocked status, input progress such as
  `3 / 3`, blocked-gate failure summaries, empty gate activity, and draft
  warnings when workflow endpoints are incomplete. The prototype fixture uses a
  running, satisfied AND gate so machine status, gate status, input progress,
  and gate activity are all visible.
- Interactions that must stay recognizable: a gate accepts incoming workflow
  edges through the left target handle, can start reverse edge creation from
  that target side, and can emit outgoing workflow edges through the right
  source handle after gate conditions are satisfied. Gate type controls whether
  incoming inputs satisfy the gate: AND requires all incoming edges, OR any
  incoming edge, and XOR exactly one incoming edge.

## Layout Invariants

- Conceptual regions and ordering: flat section titlebar first, then the gate
  body with workflow identity, gate type/status summary, input progress,
  gate-only activity, and workflow edge affordances.
- Relative placement of important controls: no start-node run controls appear
  in the gate body; read-only machine/gate/input status remains grouped
  together and visually separate from activity.
- Grouping/containment relationships: label and machine group stay together;
  gate type and gate status are paired as the gate decision summary; input
  progress is adjacent to those statuses; gate activity is a distinct overflow
  region.
- Scroll or overflow expectations: recent gate activity may overflow
  independently without resizing the shell or changing the section titlebar.
  Workflow target and source affordances remain anchored to opposite sides.

## Intentional Differences

- The flat prototype may replace old rounded/shadowed production node chrome
  with the accepted flat shell, monospace rhythm, and subtle section bands
  established by Callable and Param Dict/Dict.
- Production layout logic intentionally not reused: Tailwind class chains,
  rounded card structure, state hooks, measurement hooks, floating box handlers,
  and xyflow handle DOM are not copied into the prototype.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element is backed by the real
  StateMachineGate contract, gate settings, node presentation, runtime gate
  outputs/events, or workflow edge handle behavior.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: title/label, machine group, AND gate type, Running machine
  status, Satisfied gate status, `3 / 3` input progress, gate activity rows,
  left `workflow-target`, left reverse-start affordance metadata, and right
  `workflow-source` edge all map to inspected source.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task adds a new prototype only and does not redesign their
  layout, fixtures, controls, ports, row hierarchy, or rhythm.

## Component Plan

- New files or functions: add `FlatStateMachineGateSectionPrototype` and small
  prototype-only StateMachineGate body helpers in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
- Static fixture data: label `Review Gate`, machine group `workflow-main`,
  gate type `AND`, running machine status, satisfied gate status, input
  progress `3 / 3`, and recent activity labels grounded in gate node
  presentation events.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert the StateMachineGate affordances and continue protecting Callable and
  Param Dict/Dict baselines from accidental redesign.
