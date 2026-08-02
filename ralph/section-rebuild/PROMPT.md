You are operating in a Ralph loop for Setta section prototype rebuilds.

Read these files before acting:
- `AGENTS.md`
- `ralph/section-rebuild/IMPLEMENTATION_PLAN.md`
- `ralph/section-rebuild/progress.txt`

Goal:
Create pure HTML/CSS section prototypes for every real section type other than
the already accepted Callable and Param Dict/Dict prototypes. Each new
prototype must preserve the real section type's functional affordances and
broad layout relationships while using the newer flat prototype design
language.

Non-negotiable boundaries:
- The current redesigned Callable prototype and current redesigned Param
  Dict/Dict prototype are accepted as-is and frozen as design baselines. Ralph
  must not alter their visible
  layout, section structure, row hierarchy, controls, ports, fixture content,
  or visual rhythm.
- Ralph may only touch Callable or Param Dict/Dict code for behavior-preserving
  cleanup such as extracting shared prototype-only primitives, removing
  duplication, or improving maintainability. If that cleanup would change the
  rendered design, do not do it.
- During a new section task, the default is to leave Callable and Param
  Dict/Dict implementation, fixtures, and styling untouched. Only make a shared
  cleanup if it is clearly mechanical, prototype-only, and independently
  verifiable as having no visible rendered effect on those accepted baselines.
- Do not select Callable or Param Dict/Dict as product-design tasks. They are
  examples of the accepted design language and regression baselines, not targets
  for redesign in this loop.
- Ralph's product work is to add new prototypes for every other real section
  type. New prototypes must be visually informed by the real current section's
  broad layout and functionality, then expressed in the accepted flat prototype
  design language established by Callable and Param Dict/Dict.
- New section prototypes may use the same flat section shell and titlebar
  pattern. The outer frame/titlebar can be shared; the section-specific design
  work should be in the body regions, controls, ports, state indicators,
  fixtures, and interactions.
- A shared shell/titlebar does not mean every section should inherit the same
  row-heavy height or whitespace. Preserve the real section type's broad
  compact/tall proportions. If a real section is compact, use section-specific
  prototype sizing/spacing instead of leaving large unmapped empty regions.
- Do not create fictional sections, fake workflows, decorative sample concepts,
  or controls that do not map to the real section type.
- Do not copy the old production design wholesale. Production code and
  screenshots are evidence for affordances and layout relationships only.
- Preview-page chrome is not part of the section redesign. Do not style labels,
  notes, wrappers, or utility controls so they look like section content.
- Every rendered section prototype must have a small section-type label above
  it, rendered as external preview-page/gallery chrome. The label must be
  visually separated from the section and must not appear embedded in the
  section card, titlebar, toolbar, body, port rows, controls, or any reusable
  section layout component.
- Add or preserve section-type labels in the preview-page/gallery wrapper, not
  inside `FlatSectionPrototype` section bodies. Adding this external label above
  Callable and Param Dict/Dict is allowed only when their internal layout,
  dimensions, spacing, controls, and hierarchy remain unchanged.
- Do not add visible Light/Dark labels for theme columns. The visual contrast is
  enough; non-visible accessibility labels and data attributes are acceptable.

Core rules:
- Select exactly one unchecked task from the plan.
- The selected task must be a real non-Callable/non-Dict section from the plan
  inventory. If the task cannot be traced to that inventory, stop.
- Start every section with the required assessment file before editing
  implementation files.
- In the assessment, map every visible prototype region, control, port, status,
  and fixture concept back to real section behavior or data. Remove anything
  that cannot be mapped; do not fill gaps with a story.
- Callable and Param Dict/Dict are protected accepted baselines. You may extract
  shared components, remove duplication, or optimize their code only when the
  rendered layout, visual hierarchy, fixture shape, and user-facing affordances
  stay the same. Do not redesign them.
- Production React section code is reference-only. Use it to learn
  functionality, data, states, controls, and interactions.
- Do not reuse production layout logic, DOM structure, grid/subgrid choices,
  Tailwind class chains, measurement hooks, or component organization.
- Do not invent fictional section concepts, fake workflows, decorative content,
  or controls that are not grounded in an existing section type.
- Do not lift the old design wholesale. Match the real section's general
  layout and functionality, then express it in the established flat prototype
  language.
- Treat screenshots as evidence for layout relationships, not pixel-perfect
  targets.
- Preserve functionality and relative layout hierarchy, not exact spacing,
  color, radius, or typography.
- Prefer a shared prototype-only shell/titlebar for new sections when it fits
  the accepted flat design language. Do not invent a new outer chrome for each
  section unless the real section type needs a different structural affordance.
- Preserve section-specific density and broad dimensions. Do not force compact
  sections into the Callable/Dict baseline height or leave large empty body
  regions that do not map to real section behavior.
- Verify the section-type label reads as page/gallery chrome above the
  prototype, uses the correct section type text, and does not alter the
  prototype's internal layout, controls, spacing, hierarchy, or overflow.
- Do not install or upgrade dependencies without explicit user approval.
- Stop and record the blocker instead of implementing if a task cannot be
  grounded in a real section type, cannot avoid copying the old design, or would
  require a visible Callable or Param Dict/Dict layout change.

Work loop:
1. Pick one unchecked task from `IMPLEMENTATION_PLAN.md`.
2. Confirm the task is not Callable, Param Dict, or Dict, and that the planned
   implementation will not redesign the accepted Callable or Param Dict/Dict
   prototypes.
3. Write `ralph/section-rebuild/assessments/<task-id>.md` using the assessment
   template in the plan.
4. Implement only that task.
5. Run focused verification. Prefer:
   - `pnpm -C frontend exec vitest run frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx`
   - any new or updated focused test path.
6. If renderable UI changed, run CDP/Playwright visual verification when
   feasible and record whether it was done. If the app server responds but the
   browser MCP/CDP tool fails twice or stops returning progress, stop the
   iteration and record the blocker instead of retrying indefinitely.
7. Mark the task complete in `IMPLEMENTATION_PLAN.md`.
8. Append a concise entry to `progress.txt` with files changed, verification,
   visual-check status, protected-baseline status, and caveats.
9. Stop after one task.

If no unchecked tasks remain, output `<promise>COMPLETE</promise>`.
