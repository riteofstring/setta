# Setta 3 Architecture Rewrite

Setta 3 is a ground-up rewrite. The backend stays Go, the frontend stays
TypeScript, and the app becomes an Electron desktop app.

The core product direction is a simpler, faster Setta built around simple nodes,
Project Chat, Codex-driven work, terminals, Git, and state machines. The rewrite
should keep the architecture open to plugins, future agent harnesses, richer
node types, artifacts, and runtime SDKs, but those should not bloat the initial
implementation.

## Core Principles

- Use simple nodes for everything other than terminals, chat sections, and text /
  prompt sections.
- Avoid showing code blocks and implementation noise as the primary AI work
  surface. During AI work, show what the AI is doing visually; after completion,
  show a short AI summary plus a colored Git diff.
- Multi-agent AI work should be visually represented with presence/activity
  patterns similar to collaborative editor surfaces.
- Keep the first version narrow enough that every core flow is polished.
- Prefer architecture hooks over full implementations for features that are not
  needed at launch.
- Keep the Electron renderer thin. Go should own durable product state, graph
  execution, agent orchestration, MCP/tools, browser automation, and other
  correctness-sensitive runtime behavior.

## Initial Core

- Electron desktop app.
- Clear local workspace flow, similar to VS Code: open the app on a laptop,
  select/open a workspace, and work locally by default.
- Active local workspace switching, similar to cmux: keep an ordered active
  workspace list, selected workspace, and separate recent workspaces.
- GUI remote workflow over SSH for remote workspaces. CLI support is secondary
  and can come later.
- Project Chat:
  - built-in chat runtime integrated with Codex, MCP, runs, Git diffs, and state
    machines
  - history
  - message branching/editing
  - attachments
  - slash commands
  - stop/resume behavior
  - dictation
  - AI settings
- Codex agent harness as the only initial external-agent harness.
- Harness abstraction that can support future harnesses such as Claude.
- Setta MCP server for Codex-to-Setta tool access.
- Minimal MCP configuration surface needed by Codex.
- Setta MCP tools for Codex agents: stable tool names, schemas, backend
  handlers, and permission/approval rules.
- Basic approval gates for risky Setta MCP tools.
- Drastically simplified agent profiles or equivalent agent configuration.
- Terminals.
- Git status, diffs, and basic history/review surfaces.
- Runs:
  - durable records for Codex turns, terminal commands started by Setta, and
    state-machine executions
  - user-facing run history
  - per-run trace/trajectory timeline for prompts, tool calls, terminal output,
    approvals, diffs, and final status
- State machines as a core workflow primitive, with a cleaner workflow model and
  less accidental UI/config complexity than the current implementation.
- LLM configuration, API keys, and transcription profiles, with a simpler UX.
- VS Code-like settings area. Settings should not be represented as a Setta
  project.
- Window snapping and docking.
- Section URLs.
- Optional Setta-generated code, but keep it out of the primary UX unless needed.
- Watch Code, if it can stay simple enough for the initial scope.
- Mobile app for control, focused on chat, approvals, runs, diffs, artifacts, and
  terminal tails rather than full canvas editing.

## Desktop And UI Stack

- Electron is the desktop shell choice partly because Setta needs a predictable
  Chromium, DevTools, screenshot, console/network, DOM-inspection, and CDP-style
  automation path for generated UI preview and verification.
- Prove the browser automation loop early before depending on it broadly. Viable
  paths include Playwright's Electron support, CDP attachment, and Electron's
  `webContents.debugger` API.
- Use React + Vite for the renderer.
- Use Tailwind 4 and shadcn/ui for app chrome: panels, dialogs, settings,
  menus, forms, and other non-canvas interface surfaces.
- Keep canvas/simple-node rendering custom and lightweight. If XYFlow remains
  the graph interaction layer, node internals should still be shallow custom
  React components with heavier editors, menus, and Radix/shadcn primitives
  mounted only for active/editing states.
- Use CSS variables for design tokens. Use CSS Modules or plain CSS in hot paths
  where they make canvas/node performance or maintainability better.
- Maintain a strict node performance budget: shallow DOM, simple paint, narrow
  state subscriptions, and no always-mounted CodeMirror/editors inside inactive
  nodes.

## Runs, Traces, And Trajectories

Use these terms consistently:

- **Run**: one execution unit, such as one Codex turn, one terminal command, or
  one state-machine execution.
- **Runs / Run History**: the user-facing list of executions.
- **Trace**: the detailed timeline inside one run.
- **Trajectory**: an agent-specific trace term; useful internally or in advanced
  AI/debug contexts, but probably not the main product-facing label.

Conceptually, Run History contains runs, and each run can have a trace /
trajectory.

Minimum v0 run record:

- id
- type: `codex`, `terminal`, or `state_machine`
- status: `running`, `completed`, `failed`, or `stopped`
- startedAt / finishedAt
- workspace id
- branch / commit SHA when available
- title / summary
- input prompt or command
- linked chat id, state-machine id, or terminal id
- transcript/log stream reference
- Git diff summary when available

## State Machines

State machines should stay core. The goal is not to make them less capable; the
goal is to keep the workflow model clean while removing accidental complexity
from the current implementation.

Keep or strengthen:

- Start / Gate / End concepts.
- Chat/agent nodes as workflow participants.
- Parallel fanout.
- AND / OR / XOR gates.
- Completed / failed / signal triggers.
- Structured signal payload matching.
- Stop/reset/run status.
- Integration with Runs / traces.

Current likely bloat:

- `machineGroupId` as the main workflow identity. Prefer explicit workflow
  objects with ids/names.
- Too much per-edge chat configuration. Most settings should inherit from the
  target node unless explicitly overridden.
- Prompt source complexity on edges as the default UX.
- Activation-count conditions as a default-level feature; keep this as advanced
  behavior if needed.
- Share/deployment policy coupling.
- Duplicated workflow controls outside the workflow/run surface.
- State-machine-specific permission coupling to agent profile details. Prefer a
  normal workflow/run protocol for structured signals.
- Core workflow records carrying presentation-only UI metadata.

Likely missing capabilities:

- Human approval/input nodes.
- Terminal/action/MCP-tool nodes, not only chat nodes.
- Typed inputs/outputs between steps.
- Retry, timeout, and failure-handler policies.
- Loops with guardrails/max iterations.
- Workflow run trace visualization.
- Clear object model: `Workflow -> nodes -> edges -> runs`.

## Architecture Hooks, Not Initial Full Features

Design for these, but do not build the full feature unless needed for the first
usable rewrite:

- Plugin boundaries.
- Future external-agent harnesses such as Claude.
- External MCP client support for user-configured MCP servers.
- MCP bridge support for third-party clients or transport compatibility, if a
  target agent/runtime requires it.
- Scoped tool access for node-attached chats, state-machine steps, and other
  narrower agent contexts.
- Rich artifact handling beyond chat attachments.
- Listener / realtime / Python SDK surface.
- LSP and code editing.
- Rich file, browser, spreadsheet, chart, image, and draw nodes.
- Richer operator-facing surfaces.

## Later Features

- Rich artifact handling beyond Project Chat attachments.
- Listener / Python SDK / realtime API.
- LSP and code editing.
- File/browser/spreadsheet/chart/image/draw sections.
- Full plugin system and plugin marketplace/management UX.
- Additional harnesses beyond Codex.
- More advanced operator surfaces, if they prove necessary.

## Remove Or Defer From The Rewrite

- View modes.
- Kanban.
- Social.
- Iframe.
- Current custom runs. Replace with the simpler Runs model above.
- JSON sections.
- Current Settings page / Setta settings project.
- Project configs.
- Variants. Variant-like behavior can come later through programmatic meta
  controls, such as a rotary or dropdown that changes a section state.
- Quick info.
- Param UI types. Keep meta controls, but remove the current configurable param
  UI type system.
- Sharing mode.
- One-click deploy / sharing functionality.
- JSON Render / App Gen as a core feature. If it returns, it should be plugin or
  skill based, not core.

## Operator Views

Do not include view modes in v0.

An "operator view" means a simplified surface for someone running a workflow
rather than building it: selected controls, run status, recent runs, artifacts,
instructions, and approval prompts without exposing the full canvas internals.

If this returns later, prefer a simpler "Run Panel" or "Dashboard" concept over
the current view-mode system.

## Open Decisions

- Whether Watch Code belongs in initial core or the first follow-up.
- Whether XYFlow is the committed canvas/graph interaction layer or just the
  current research assumption.
- Exact Setta 3 state-machine object model and v0 workflow node/action set.
- How much plugin infrastructure is needed in the first architecture pass before
  plugin UX exists.
- Exact UX for future scoped tool access and approval gates.

## Research Notes

- `docs/plans/stack-research/setta-ui-stack-recommendation.md`
- `docs/plans/stack-research/setta-desktop-shell-browser-summary.md`
