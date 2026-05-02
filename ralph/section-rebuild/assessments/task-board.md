# TaskBoard Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  - `internal/projectstate/frontend_section_codeobj_contracts.go` via the plan inventory, confirming `TaskBoard` is a real non-Callable/non-Dict section type.
  - `frontend/src/utils/generatedTypes.ts` for `TaskBoardSectionImpl`, `TaskBoardColumn`, `TaskBoardTask`, `TaskBoardViewModeEnum`, `TaskBoardTaskRecurrenceEnum`, and `TaskBoardUIConfig`.
  - `frontend/src/utils/taskBoard.ts` and `frontend/src/utils/taskBoard.test.ts` for normalization, fallback columns, grouped lanes, structural/non-structural updates, and sort indexes.
  - `frontend/src/components/Section/Layouts/taskBoardRecurrence.ts` and test coverage for recurrence summaries.
  - `frontend/src/components/Section/Layouts/TaskBoardArea.tsx` as reference-only evidence for controls, states, interactions, and broad layout relationships.
- Data shown:
  - `viewMode`, `columns`, and `tasks` from the TaskBoard section impl.
  - Column `id`, `name`, `color`, and `sortIndex`.
  - Task `id`, `title`, `description`, `columnId`, `completed`, `dueDateIso`, `recurrence`, recurrence selections, and `sortIndex`.
  - A normalized Kanban lane fixture with Todo, Doing, and Done columns and four tasks.
- Controls/actions:
  - View mode controls for Task List and Kanban, with Kanban selected.
  - New task title input, add task, and add column controls.
  - Editable column color/name affordances, per-lane add task controls, and column resize handles.
  - Task drag handle, completion checkbox, title field, schedule button, description toggle, remove action, due date summary, and recurrence summary.
- Important states:
  - Primary state is editable Kanban mode, matching the default generated view mode.
  - Completed task in the Done column.
  - Task with due date and specified-day recurrence summary.
  - Task with visible description content.
  - Empty-lane handling is acknowledged through the real production behavior but not shown because this iteration uses one primary populated state.
- Interactions that must stay recognizable:
  - Drag reordering and lane reassignment are represented by task drag handles and lane grouping.
  - Column resizing is represented by vertical resize handles between lanes.
  - Completing a task and auto-placement into Done is represented by a checked task in the Done lane.
  - Schedule editing is represented by the calendar/schedule control and visible due/repeat summaries.
  - Description editing is represented by a description toggle and visible description body.

## Layout Invariants
- Conceptual regions and ordering:
  - Shared flat section shell and titlebar remain outside the section-specific body.
  - Body starts with a compact board toolbar containing view mode, add-task input, add task, and add column controls.
  - Main body is a horizontally arranged Kanban board.
  - Each lane contains a column header, stacked task cards, and a lane add-task control.
- Relative placement of important controls:
  - View mode controls sit before task creation controls, as in the production toolbar.
  - Column color/name controls live in each lane header.
  - Task drag, completion, title, schedule, description, and remove affordances stay inside each task card.
  - Column resize handles sit between adjacent lanes.
- Grouping/containment relationships:
  - Tasks are visually grouped inside their owning columns.
  - Done column contains the completed task.
  - Schedule summaries and description text stay attached to the task card they describe.
- Scroll or overflow expectations:
  - The board body can overflow horizontally for lanes.
  - Lane task stacks can overflow vertically inside the board rather than growing the section indefinitely.

## Intentional Differences
- What the flat prototype is allowed to change:
  - It uses static HTML/CSS rather than the production DnD, dropdown, OpenAPI, and optimistic update implementation.
  - It simplifies the live schedule dropdown into a visible schedule button plus due/repeat summaries so the affordance is present without reproducing production menu logic.
  - It uses compact flat styling, square controls, and prototype-only class names instead of production Tailwind chains.
- What production layout logic is intentionally not reused:
  - No production DOM structure, grid/subgrid choices, DnD provider tree, measurement hooks, Tailwind class chains, Radix menu, or OpenAPI update logic is copied.
- Confirmation that the prototype is not fictional and is not an old-design lift:
  - Every shown field and control maps to `TaskBoardSectionImpl`, `TaskBoardColumn`, `TaskBoardTask`, generated TaskBoard UI options, or a production TaskBoardArea control.
- Confirmation that every visible prototype affordance maps to real section behavior or data:
  - Toolbar, view mode, task creation, column creation, column color/name, lane containment, drag handles, task completion, title editing, schedule, recurrence, description, remove action, per-lane add task, and resize handles all map to real TaskBoard behavior or data.
- Confirmation that the required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component:
  - The `TaskBoard` label will be added only through `FlatPrototypeGalleryItem`, above the prototype.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly changed:
  - No Callable or Dict fixture, body structure, row hierarchy, ports, controls, or CSS will be edited for this task.

## Component Plan
- New files or functions:
  - Add prototype-only TaskBoard fixture types/constants in `FlatSectionPrototype.tsx`.
  - Add `FlatTaskBoardSectionPrototype`, `FlatTaskBoardBody`, and small TaskBoard-only rendering helpers.
  - Add TaskBoard to the gallery in both dark and light columns with an external `TaskBoard` label.
  - Add TaskBoard-only CSS classes and sizing rules.
- Static fixture data:
  - Editable Kanban board named `Release Board`.
  - Columns: Todo, Doing, Done.
  - Tasks: draft owner brief, verify visual pass, package screenshots, and ship section prototype with mapped due/recurrence/description/completion states.
- Tests/verification:
  - Extend focused markup tests for gallery registration, external label count, TaskBoard body affordances, and CSS sizing/overflow.
  - Run `pnpm -C frontend exec vitest run src/components/Section/Layouts/FlatSectionPrototype.test.tsx`.
  - Run CDP visual verification for `/internal/flat-section-prototype` if feasible.
