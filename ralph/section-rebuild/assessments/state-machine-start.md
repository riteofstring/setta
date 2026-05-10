# StateMachineStart Prototype Assessment

## Functionality

- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`,
  `frontend/src/components/Section/Layouts/stateMachineNodePresentation.ts`,
  `frontend/src/components/Section/Container/StateMachineEdgeHandles.tsx`,
  `frontend/src/state/actions/stateMachineRuns.ts`,
  `frontend/src/state/actions/stateMachineEdges.ts`,
  `frontend/src/state/actions/stateMachineDraftValidation.ts`, and focused
  StateMachine tests.
- Data shown maps to real StateMachineStart data and run presentation:
  section label/title, `machineGroupId`, run status label, recent machine
  activity events, and the start-node workflow source handle.
- Controls/actions map to real start-node behavior: Start, Stop, and Reset run
  controls from `StateMachineStartControls`, plus the shared prototype-only
  section chrome controls.
- Important states: running, idle/no-run, completed/failed/stopped, cleared
  state after reset, disabled controls when a run action is unavailable, and
  draft warnings when the machine group is incomplete. The prototype fixture
  uses the running state so current run/activity remains visible.
- Interactions that must stay recognizable: the start node can initiate a run,
  stop an active run, reset an existing run, and create outgoing workflow edges
  from its right-side source handle. It does not accept incoming workflow edges.

## Layout Invariants

- Conceptual regions and ordering: flat section titlebar first, then the
  StateMachineStart body with identity/status, activity, run controls, and the
  outgoing workflow edge affordance.
- Relative placement of important controls: Start/Stop/Reset stay grouped near
  the run status, with the active run state readable before the controls.
- Grouping/containment relationships: identity and machine group stay together;
  recent activity is a distinct scrollable status region; workflow source
  affordance is separate from the run controls and appears on the right side.
- Scroll or overflow expectations: recent activity may overflow independently
  without resizing the shell or changing the section titlebar.

## Intentional Differences

- The flat prototype may replace old rounded/shadowed production node chrome
  with the accepted flat shell, monospace rhythm, single-line rows, and subtle
  section bands established by Callable and Param Dict/Dict.
- Production layout logic intentionally not reused: Tailwind class chains,
  rounded card structure, state hooks, measurement hooks, and overlay handle DOM
  are not copied into the prototype.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element is backed by the real
  StateMachineStart contract, node presentation, run controls, run events, or
  workflow edge handle behavior.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: title/label, machine group, Running status, activity rows,
  Start/Stop/Reset controls, disabled current-action affordances, and right-side
  `workflow-source` edge all map to inspected source.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task adds a new prototype only and does not redesign their
  layout, fixtures, controls, ports, row hierarchy, or rhythm.

## Component Plan

- New files or functions: add `FlatStateMachineStartSectionPrototype` and small
  prototype-only body helpers in
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
- Static fixture data: label `Kickoff`, machine group `workflow-main`, running
  run status, Start disabled, Stop/Reset available, and recent activity labels
  grounded in state machine run presentation events.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert the StateMachineStart affordances and continue protecting Callable and
  Param Dict/Dict baselines from accidental redesign.
