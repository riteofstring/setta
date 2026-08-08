---
plan_path: ralph/section-rebuild/IMPLEMENTATION_PLAN.md
handoff_path: ralph/section-rebuild/progress.txt
history_path: ralph/section-rebuild/progress.txt
prompt_file: ralph/section-rebuild/PROMPT.md
workdir: .
iterations: 100
new_session_every: 1
codex_inactivity_timeout_seconds: 1800
reasoning_effort: xhigh
service_tier: fast
yolo: true
terminal_mode: foreground
verify_command: Focused frontend tests for the selected prototype plus CDP visual verification when renderable UI changes.
---

# Ralph Loop Config

This is the reusable Ralph entrypoint for the section rebuild loop in this
worktree. The runnable prompt, plan, and progress log live under
`ralph/section-rebuild/`.

Default entrypoint:

```bash
./ralph.sh
```

The wrapper reads the frontmatter above for the default prompt, workdir,
iteration count, inactivity timeout, fresh-session cadence, and yolo setting.
Other fields are durable handoff metadata for humans and future loop tooling.

## Working Style

- Start each Codex pass from the section rebuild plan and progress file.
- Select exactly one bounded section task per iteration.
- Keep production React section code as reference-only material.
- Ralph's product output is new section prototypes for real section types other
  than Callable and Param Dict/Dict. It must not spend an iteration redesigning
  Callable or Param Dict/Dict.
- Treat the current redesigned Callable and Param Dict/Dict prototypes as
  frozen accepted baselines. Ralph may refactor or optimize their prototype code
  only when their rendered layout, hierarchy, controls, ports, fixtures, and
  visual rhythm stay the same.
- For normal new-section iterations, Ralph should leave Callable and Param
  Dict/Dict implementation, fixtures, and styling untouched. Shared cleanup is
  allowed only when it is mechanical, prototype-only, and verified to have no
  visible rendered effect on those baselines.
- Add new prototypes for the other real section types only, grounded in current
  section functionality and broad layout relationships, expressed in the
  accepted flat prototype design language.
- New section prototypes may essentially use the same flat section shell and
  titlebar pattern. Prefer a shared prototype-only shell/titlebar for the outer
  frame, and make the body regions, controls, ports, state indicators, and
  fixtures section-specific.
- Every visible region, control, port, status, and fixture concept in a new
  prototype must map back to real section behavior or data. Remove anything that
  cannot be mapped instead of inventing a workflow.
- Keep preview-page chrome visually separate from section prototypes. Labels,
  notes, or controls that are not part of the redesign must not look like they
  belong to a section.
- Every rendered section prototype must have a small section-type label above
  it, rendered as external preview-page/gallery chrome. The label must be
  visually separated from the section and must not appear embedded in the
  section card, titlebar, toolbar, body, port rows, controls, or reusable
  section layout components.
- Add or preserve section-type labels in the preview-page/gallery wrapper, not
  inside section bodies. Adding this external label above Callable and Param
  Dict/Dict is allowed only when their internal layout, dimensions, spacing,
  controls, and hierarchy remain unchanged.
- Do not add visible Light/Dark labels for theme columns; the theme contrast is
  self-evident. Accessibility labels and data attributes are fine.
- Do not invent fictional sections, fake workflows, decorative controls, or
  wholesale copies of the old production design.
- If completing a task would alter the accepted Callable or Param Dict/Dict
  visible layout, or would require a fictional/old-design section, stop and
  record the blocker instead.
- Update the plan and progress log after each completed slice.
- Run focused verification for the changed prototype, and record whether visual
  verification was done.
