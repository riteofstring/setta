# GpuFlow Visual Fidelity Checkpoint Temporary Plan

## Goal

Create a repeatable visual baseline before resuming the full-scene/canvas
refactor loop. The checkpoint should answer whether the current canvas-owned
UI is visually close enough to the pre-loop DOM/GPU implementation, and should
produce artifacts that make regressions reviewable.

This is a temporary plan. After the checkpoint is working, fold the relevant
requirements into
`docs/plans/gpuflow-full-scene-canvas-content-clean-break-plan.md` and delete
or archive this file.

## Comparison Refs

Primary baseline:

- Branch/ref: `go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan`
- Commit: `37bdaa5efed8fb8d86425ecfa43fc85f61d0d08d`
- Purpose: the immediate pre-loop state for the full-scene/canvas work.

Canvas candidate:

- Branch/ref: `go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan-full-scene`
- Current checked commit when this plan was written:
  `7909db3928a9d2bdd42f2371a1f98acb17b8902f`
- Purpose: the current canvas-owned implementation.

Optional context baseline:

- Branch/ref: `go-rewrite-canvas-replace-xyflow-2`
- Commit: `6b6036f456ad8a093cd3a364870d6ee1632b376b`
- Purpose: identify any visual drift that happened before the full-scene loop.

Do not use `go-rewrite` as the primary fidelity target. It is too far back and
would mix unrelated UI/runtime changes into this checkpoint.

## Artifact Layout

Use an append-only directory:

`perf/visual-fidelity/2026-05-05-gpuflow-full-scene/`

Expected contents:

- `baseline-primary/`: screenshots from `37bdaa5e`.
- `candidate/`: screenshots from the current canvas branch.
- `baseline-secondary/`: optional screenshots from `6b6036f45`.
- `diffs/`: generated image diffs when screenshot dimensions match.
- `manifest.json`: refs, commands, routes, viewport sizes, browser flags, and
  fixture names.
- `review.md`: human review notes, accepted differences, and blocking visual
  regressions.

Do not overwrite prior completed checkpoint runs. While developing this
temporary checkpoint, regenerating the `2026-05-05` directory is acceptable.
If a later checkpoint is needed, create a new timestamped directory before
capture.

## Step 1: Create Isolated Worktrees

Create worktrees so baseline capture does not disturb the canvas branch:

```bash
mkdir -p ../setta-visual-fidelity-worktrees

git worktree add --detach \
  ../setta-visual-fidelity-worktrees/gpuflow-baseline-primary \
  37bdaa5efed8fb8d86425ecfa43fc85f61d0d08d

git worktree add --detach \
  ../setta-visual-fidelity-worktrees/gpuflow-candidate \
  7909db3928a9d2bdd42f2371a1f98acb17b8902f

git worktree add --detach \
  ../setta-visual-fidelity-worktrees/gpuflow-baseline-secondary \
  6b6036f456ad8a093cd3a364870d6ee1632b376b
```

Use `dev_install.sh` only if a worktree cannot run with the existing local
tooling. Do not rewrite lockfiles.

## Step 2: Define Deterministic Fixtures

Capture the smallest stable set of project routes/states that exercise the
canvas-owned surfaces:

- Dense param dict rows with nested params and scrolling.
- Slider, rotary, switch, button, password, and dropzone rows.
- Dropdown open state with highlighted and selected options.
- Configured color picker open state.
- Date calendar open state with navigation controls and selected date.
- Validation/status/duplicate-name overlays.
- Edge labels, connection handles, selection bounds, drag preview, and resize
  handles.
- Active native islands: text/CodeMirror, numeric typing, native date/time,
  native color, file picker/dropzone activation.

The fixture source should be deterministic. Prefer existing checked-in project
fixtures or seeded app state. If new fixture data is needed, add it as a
focused test fixture rather than depending on a manually edited local project.

Record each fixture with:

- route or project slug
- setup action sequence
- expected stable selectors or canvas hit records
- viewport size
- whether WebGPU/html-in-canvas flags are required

## Step 3: Capture Screenshots

Add a temporary capture script, preferably under `scripts/`, that can run the
same fixture manifest against each worktree.

Requirements:

- Start each app with `./kill.sh` first, then `./ai.sh`.
- For WebGPU/html-in-canvas runs, use:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

- Use Chrome DevTools Protocol or Playwright to capture full-page or clipped
  region screenshots.
- Use fixed viewports at minimum:
  - desktop: `1440x900`
  - compact desktop: `1024x768`
  - mobile-ish narrow: `390x844`
- Wait for the project surface to be stable before capture:
  - app route loaded
  - GPU root present
  - expected canvas/source surfaces present
  - no console errors
  - fixture-specific popup/control state active
- Save screenshots with stable names:
  `<fixture>__<viewport>__<ref-label>.png`.

If WebGPU screenshot capture times out, record the timeout in `manifest.json`
and fall back to clipped DOM/canvas-region screenshots only when they are
reliable. Do not treat "canvas exists" as visual fidelity evidence.

## Step 4: Compare And Review

Generate diffs only when screenshot dimensions match exactly. Store them under
`diffs/`.

Classify each fixture in `review.md`:

- `pass`: visually close enough.
- `accepted-difference`: intentional difference, documented with reason.
- `blocking-regression`: must be fixed before the loop resumes.
- `capture-blocked`: screenshot infrastructure failed; must be resolved or
  replaced with another reliable capture method.

Review for these specific regressions:

- text clipping or overflow
- missing labels or status overlays
- incorrect row spacing and indentation
- wrong control sizing, thumb positions, selected states, or focus states
- popup clipping/z order/scroll behavior differences
- edge label placement and handle alignment
- selection/resize affordance visibility
- blurry or mis-scaled canvas content
- unexpected retained DOM islands or portal roots during canvas-owned controls

The checkpoint is not complete until every required fixture is either `pass` or
`accepted-difference`.

## Step 5: Gate Loop Resumption

Before restarting
`./scripts/run-codex-gpuflow-full-scene-canvas-content-clean-break-loop.sh`:

- Add the capture command and artifact path to the full-scene plan.
- Add an explicit acceptance item: visible canvas-owned replacements require
  baseline-vs-candidate screenshots, not only CDP smoke checks.
- Add a loop instruction that screenshot timeout is a blocker for visible
  rendering changes unless a documented equivalent capture method succeeds.
- Add a note that logic-only cleanup can continue with tests only, but any
  visible renderer/control change must update the visual-fidelity artifacts.
- Commit the temporary checkpoint plan and any capture script separately from
  visual fixes.

Only resume the loop after the primary baseline screenshots from `37bdaa5e`
exist and the current candidate has either passed review or has a prioritized
visual-fix list.
