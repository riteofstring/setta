# Section Rebuild Ralph Plan

## Goal

Create pure HTML/CSS section prototypes for every real section type other than the accepted Callable and Param Dict/Dict baselines. Each new prototype must preserve the real section type's functional affordances and broad layout relationships while using the newer flat prototype design language.

This loop is not a redesign pass for Callable or Param Dict/Dict. They define the accepted section design language and serve as regression baselines while other section prototypes are added.

The current production React sections are reference material only. They may be read to understand data, controls, states, interactions, and the general layout relationship between conceptual regions. Do not reuse or port their layout logic, wrapper structure, grid/subgrid choices, Tailwind class chains, measurement hooks, or DOM organization into the prototype work.

The section type inventory comes from the Go-owned frontend section contract in `internal/projectstate/frontend_section_codeobj_contracts.go`. Do not invent section types. If the inventory changes, update this plan from the Go-owned source before adding prototype work.

## Protected Baselines

`FlatCallableSectionPrototype` and `FlatDictSectionPrototype` are accepted redesigned baselines. `FlatDictSectionPrototype` is the accepted Param Dict/Dict prototype. Their current layout and visual hierarchy must not be altered by this Ralph loop.

This is a hard boundary, not a preference. Ralph's product work is new prototypes for every other real section type. Callable and Param Dict/Dict are only allowed to change when the change is behavior-preserving cleanup and the rendered design remains the same.

Callable and Param Dict/Dict must not be selected as section-design tasks. If a future task or shared primitive would require a visible change to either accepted baseline, skip that approach and record the blocker.

For normal new-section iterations, leave Callable and Param Dict/Dict implementation, fixtures, and styling untouched. Cleanup touching those baselines is allowed only when it is explicitly mechanical, prototype-only, and verifiably produces no rendered change. If that cannot be proven in the same iteration, do not touch the baselines.

Allowed changes for Callable and Param Dict/Dict:

- Extract shared prototype primitives or components.
- Rename or reorganize internal helper code.
- Remove duplication or improve maintainability.
- Add tests that preserve their accepted behavior.

Forbidden changes for Callable and Param Dict/Dict:

- Changing the visible layout, row hierarchy, controls, ports, fixtures, or visual rhythm.
- Making them more like the production/old design.
- Replacing them with a different design because a new section prototype wants shared code.
- Updating tests to accept a visible redesign unless the user explicitly approves that redesign outside the loop.

If a shared primitive would force a Callable or Param Dict/Dict layout change, do not make that shared primitive. Build the new section prototype separately instead.

## Design Guardrails

- New prototypes must represent real existing section types, not fictional examples.
- Every new prototype must be grounded in production code, owner tests, screenshots, or generated/Go-owned type contracts.
- Every visible region, control, port, state, and fixture concept in a new prototype must map back to real section behavior or data. If it cannot be mapped, remove it or stop and record the uncertainty.
- Use the production section's general layout and functional relationships as the visual reference: header/control placement, primary body regions, nested/grouped content, ports/edges, scroll or overflow behavior, active/empty/error states, and important affordances.
- Do not chase pixel parity with the old production design.
- Do not lift the old production design wholesale. No copied DOM structure, Tailwind chains, grid/subgrid decisions, or old chrome wrappers.
- Express every new section in the established flat prototype language introduced by the accepted Callable and Param Dict/Dict prototypes.
- New sections may essentially share the same flat section shell and titlebar. Prefer shared prototype-only outer frame/titlebar primitives, with section-specific body regions, controls, ports, state indicators, fixtures, and interactions.
- Shared shell/titlebar reuse must not erase a section type's broad compact/tall proportions. Compact real sections should get compact prototype sizing/spacing, not a large row-heavy body with unmapped empty space.
- Keep preview-page labels, notes, wrappers, and utility controls visually separate from the section prototypes. Page chrome must not look like section chrome.
- Every rendered section prototype must have a small section-type label above it, rendered as external preview-page or gallery chrome. The label must be visually separated from the section and must not appear embedded in the section card, titlebar, toolbar, body, port rows, controls, or any reusable section layout component.
- Add or preserve section-type labels in the preview-page/gallery wrapper, not inside `FlatSectionPrototype` section bodies. Adding this external label above Callable and Param Dict/Dict is allowed only when their internal layout, dimensions, spacing, controls, and hierarchy remain unchanged.
- Do not add visible Light/Dark labels for theme columns; the theme contrast is self-evident. Non-visible accessibility labels and data attributes are fine.
- If the real section behavior is unclear, stop after the assessment and record the uncertainty. Do not fill gaps with decorative or imagined UI.
- If a section cannot be mapped back to the real inventory below, it is out of scope.

## Working Rules

- Start every section with a written assessment before editing implementation files.
- Before implementation, confirm the selected task is a non-Callable/non-Dict section from the inventory below.
- Treat screenshots as evidence for layout relationships, not as pixel-perfect targets.
- Preserve functionality and relative layout hierarchy, not exact spacing, color, radius, or typography.
- Existing Callable and Param Dict/Dict prototypes are accepted baselines. Do not redesign them.
- New section prototypes may reuse the established flat prototype visual language, but they must be newly composed from the assessment.
- Reusing the same shell/titlebar does not mean copying the old production design. The shared shell/titlebar is part of the new flat prototype language; production code remains reference-only for section affordances and broad layout relationships.
- Preserve section-specific density and broad dimensions. Do not force compact sections into the Callable/Dict baseline height or leave large empty body regions that do not map to real section behavior.
- Keep required section-type labels outside the section implementation, as page/gallery chrome above each prototype. Do not satisfy the label requirement by changing a section body, shared section shell, titlebar, or toolbar.
- Keep each iteration to one section type and one primary state unless the plan explicitly says otherwise.
- Any production section code under `frontend/src/components/Section/Container`, `frontend/src/components/Section/Header`, `frontend/src/components/Section/SectionParts`, and production layout files may be read but should not be modified.
- If a shared prototype primitive is needed, add it in the prototype surface only and keep it additive.

## Assessment Template

Each section assessment must be saved under `ralph/section-rebuild/assessments/<section-id>.md` and contain:

```md
# <Section Type> Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected
- Data shown
- Controls/actions
- Important states
- Interactions that must stay recognizable

## Layout Invariants
- Conceptual regions and ordering
- Relative placement of important controls
- Grouping/containment relationships
- Scroll or overflow expectations

## Intentional Differences
- What the flat prototype is allowed to change
- What production layout logic is intentionally not reused
- Confirmation that the prototype is not fictional and is not an old-design lift
- Confirmation that every visible prototype affordance maps to real section behavior or data
- Confirmation that the required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly changed

## Component Plan
- New files or functions
- Static fixture data
- Tests/verification
```

## Verification Standard

A task is complete only when:

- The assessment exists and explains the section's functionality before implementation.
- The prototype preserves the section's core affordances and layout relationships.
- Accepted Callable and Param Dict/Dict prototype behavior and layout are not redesigned.
- If Callable or Param Dict/Dict code was touched for cleanup, the iteration records how no rendered baseline change was verified.
- The section-type label is visible above the prototype, uses the correct section type text, reads as external page/gallery chrome, and does not change the prototype's internal dimensions, spacing, controls, hierarchy, or overflow.
- Production section implementation files were not edited.
- Focused frontend tests pass.
- Visual verification is performed when a renderable UI change is made, or the reason it was not run is recorded.
- If the app server responds but browser MCP/CDP fails twice or stops returning progress, stop the iteration and record the blocker instead of retrying indefinitely; do not continue to another section until the supervising pass resolves the visual check.
- If an iteration has already produced implementation changes but makes no transcript progress for more than three minutes during verification, the supervising pass may stop it, complete the focused verification manually, patch visual defects, and record the interruption before restarting the loop.

## Tasks

Current real section type inventory, excluding protected `Callable` and `Dict` (Param Dict):

- `ListRoot`
- `Group`
- `StateMachineStart`
- `StateMachineGate`
- `StateMachineEnd`
- `Image`
- `Chart`
- `Draw`
- `TextBlock`
- `Prompt`
- `MetaControl`
- `Social`
- `GlobalVariables`
- `Code`
- `GenPythonCode`
- `GenPythonMetadata`
- `Terminal`
- `IFrame`
- `Chat`
- `Browser`
- `Plugin`
- `TaskBoard`
- `Spreadsheet`

- [x] `state-machine-start`: Assess and implement a flat StateMachineStart prototype.
  - Reference-only files may include `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`, `frontend/src/components/Section/Layouts/stateMachineNodePresentation.ts`, `frontend/src/components/Section/Container/StateMachineEdgeHandles.tsx`, and tests.
  - The prototype should capture the functional shape of a start node: identity/status, start/stop/reset style controls, current run/activity state, and workflow edge affordances.
  - Do not copy the production component layout. Build a new prototype composition in the flat visual language.
  - Add focused markup tests that guard the functional affordances and protect Callable and Param Dict/Dict from accidental redesign.

- [x] `state-machine-gate`: Assess and implement a flat StateMachineGate prototype.
- [x] `state-machine-end`: Assess and implement a flat StateMachineEnd prototype.
- [x] `list-root`: Assess and implement a flat ListRoot prototype.
- [x] `group`: Assess and implement a flat Group prototype.
- [x] `image`: Assess and implement a flat Image prototype.
- [x] `chart`: Assess and implement a flat Chart prototype.
- [x] `draw`: Assess and implement a flat Draw prototype.
- [x] `text-block`: Assess and implement a flat TextBlock prototype.
- [x] `prompt`: Assess and implement a flat Prompt prototype.
- [x] `meta-control`: Assess and implement a flat MetaControl prototype.
- [x] `social`: Assess and implement a flat Social prototype.
- [x] `global-variables`: Assess and implement a flat GlobalVariables prototype.
- [x] `code`: Assess and implement a flat Code prototype.
- [x] `gen-python-code`: Assess and implement a flat GenPythonCode prototype.
- [x] `gen-python-metadata`: Assess and implement a flat GenPythonMetadata prototype.
- [x] `terminal`: Assess and implement a flat Terminal prototype.
- [x] `iframe`: Assess and implement a flat IFrame prototype.
- [x] `chat`: Assess and implement a flat Chat prototype.
- [x] `browser`: Assess and implement a flat Browser prototype.
- [x] `plugin`: Assess and implement a flat Plugin prototype.
- [x] `task-board`: Assess and implement a flat TaskBoard prototype.
- [x] `spreadsheet`: Assess and implement a flat Spreadsheet prototype.

## Notes For Future Iterations

- Prefer compact, semantic DOM over exact copies of source markup.
- Use source code to discover functionality, not styling.
- Use screenshots to check that the prototype's regions make sense, not to chase pixel parity.
- If a section's functionality is unclear after reading the owner code and tests, stop the task and write the uncertainty into the assessment instead of guessing.
- Do not accept a task that introduces a section prototype unless it can be mapped back to one of the real section types in the inventory.
- Do not accept a task that changes Callable or Param Dict/Dict layout while adding a different section type.
