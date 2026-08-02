# Setta Current Capabilities Brief for External Review

Date: 2026-05-17

This is a concise handoff for another model/reviewer. Please critique the product strategy bluntly. Do not assume the project is compelling just because it has many primitives.

## Question To Evaluate

Setta started as a visual configuration/control surface for Python code on an infinite canvas. It has since moved toward a broader AI-driven workspace for code-backed tools, workflows, agents, sections, artifacts, plugins, and app generation.

The strategic question:

> In the 2026 AI coding landscape, is Setta meaningfully differentiated, and what missing ingredients would make it indispensable?

## Current Product Shape

Setta is a visual app/workflow environment with:

- React/Vite frontend.
- Go backend as the canonical runtime/validation/state owner.
- Python package/SDK surface for CLI dispatch, listener APIs, source SDK helpers, and packaged runtime entrypoints.
- First-party plugin architecture for frontend and backend extensions.
- Project state stored as structured JSON-like config with sections, edges, view modes, workflows, plugin data, code objects, layout, and viewport state.

High-level mental model:

> Setta turns code, params, chats, terminals, artifacts, and workflows into a structured visual control surface.

## Sections / Nodes

Setta calls nodes "sections". They are richer than typical canvas nodes.

Current section types include:

- Callable/function-like sections.
- Dict/list/group sections.
- Code sections.
- Generated Python code and metadata sections.
- Terminal sections.
- Chat sections.
- Prompt sections.
- Text/markdown-like sections.
- MetaControl sections.
- Global variables.
- Image, chart, draw, browser/iframe, task board, spreadsheet, plugin sections.
- State-machine start/gate/end control nodes.

Section UX supports details such as:

- function args and kwargs,
- key/value params,
- pinned params,
- filter/search,
- resizable columns,
- CodeMirror-backed inputs,
- in-section UI controls,
- rich tooltips,
- section sizing/layout behavior.

## Params and Controls

Setta can expose function/config parameters as editable UI. Controls include simple text/code inputs plus richer UI types such as:

- sliders,
- switches,
- color pickers,
- dropdowns,
- buttons,
- date/time controls,
- password controls,
- dropzones.

MetaControl sections are standalone programmable controls. A meta control can act as a higher-level UI over lower-level params/functions. Example strategic use: one "quality" slider or preset dropdown updates several underlying technical params.

## Code and Language Support

Current documented code support is strongest around Python:

- Python package surface.
- Listener API and generated `SettaState`-style access.
- Python codegen targets.
- Watch Code plugin currently documents Python top-level function/class watching.
- First-party Python language-server plugins such as basedpyright/ty.

The backend is now Go. Go owns canonical behavior, validation, contracts, endpoint shapes, and generated frontend/Python surfaces.

The plugin architecture is intended to support additional languages and tooling, but the current strongest end-user code workflow appears Python-first.

## Watch Code

The first-party Watch Code plugin can watch repo-relative Python files and create/update/remove callable sections from discovered top-level definitions/classes. Go owns the parsing/planning/runtime behavior; the plugin gates and exposes the UI/control surface.

Strategic meaning:

> Setta can treat code as the source and keep a visual control surface synced to it.

Current caveat:

> This is not yet a general multi-language "point at any repo and get a full control surface" system.

## Chat and AI

Setta has both project-level chat and chat sections.

Capabilities include:

- managed chat runtime,
- streaming responses over websocket,
- chat history reconstructed from persisted agent runs,
- message branching/editing,
- slash commands,
- attachments,
- project chat used for project/app generation workflows,
- chat sections inside the canvas,
- standalone chat/window routes,
- AI Follow that highlights/pans to relevant sections/tool targets.

Setta supports:

- internal managed LLM execution,
- external agent configurations for Claude Code SDK and Codex app-server style agents,
- MCP server/client integration,
- per-chat runtime views for skills, MCP servers, slash commands, and AI settings.

## MCP and Agent Tooling

Setta exposes a Go-owned MCP server mounted under `/mcp`, plus a packaged `setta mcp` stdio bridge for third-party MCP clients.

Important MCP capabilities:

- built-in tool registry,
- searchable tool catalog,
- doc/schema-enriched tools,
- project-state mutation/read tools,
- terminal/doc/package/tool/status tools,
- UI settings tools,
- agent profile/run tools,
- plugin management tools,
- app-subsystem tools,
- scope enforcement through agentic context.

Agentic edges connect chats and sections:

- section -> chat can provide read/context scope,
- chat -> section can allow read/write scope,
- chat -> chat can provide peer context.

Strategic meaning:

> Setta can give agents structured, scoped access to a project surface instead of simply giving them the whole repo.

Current caveat:

> This scoped-agent story exists technically, but probably needs sharper UX and product framing to feel indispensable.

## Agent Runs and Workflow Runs

Setta already has persisted `AgentRun` records. They include:

- ID,
- status,
- started/finished timestamps,
- inputs,
- outputs,
- tool calls,
- cost,
- events,
- profile ID.

Managed chat persists runs and reconstructs chat state from them. State-machine workflow runs are also stored as normal `AgentRun` records with `runType = "state_machine"`.

Important caveat:

> This is not yet the same as a general product-wide run ledger for every human/code/workflow execution. The system has meaningful run infrastructure, but the strategic opportunity is to make "Runs" a first-class user-facing ledger across params, terminals, callables, artifacts, approvals, agent actions, code version, and replay/fork behavior.

## State Machines / Logic Gates

Setta has a workflow graph on top of the canvas using:

- Start nodes,
- Gate nodes,
- End nodes,
- Chat nodes as runnable workflow participants.

Workflow edges can activate on:

- chat run completed,
- chat run failed,
- structured signal.

Chat targets can:

- reset thread,
- send prompt from inline text, prompt template, or Prompt section.

Workflow runs can store signal/debug state such as signal events, gate status, failure summary, and cleared state.

Strategic framing:

> These should be positioned as workflow/approval/agent orchestration primitives, not generic visual programming.

## Views, Sharing, and App Mode

Setta has project view modes:

- per-view visibility,
- per-view layout,
- per-view viewport,
- tabbed views,
- `isUserFacing` flag for user/share-facing surfaces.

It also has runtime modes:

- IDE mode: full editing, auth-protected, writes to `setta_files`.
- Share mode: read-only deployment snapshot with per-viewer sessions and policy gates.
- App mode: app deployment snapshot rendered through an active app-subsystem provider.

Deployment policies can gate:

- param changes,
- variant changes,
- layout changes,
- run permission,
- LLM permission,
- external links,
- file downloads,
- multiple runs,
- run snapshot mode.

Strategic meaning:

> Setta can let an expert build a complex project and expose a simpler operator-facing view.

Current caveat:

> "Operator View" appears to be supported by primitives, but it should probably become an explicit named product concept with a polished first-run/demo path.

## Artifacts and UI Surfaces

Setta can include output and interaction surfaces beyond params:

- terminal,
- chat,
- spreadsheet,
- charts,
- images/draw,
- browser/iframe,
- task board,
- markdown/text,
- plugin-owned sections.

Strategic meaning:

> Setta can end in usable project state/artifacts, not just code diffs.

## Plugin System

Setta supports frontend and backend plugins. First-party plugins include:

- Watch Code.
- JSON Render app generation / app-subsystem provider.
- Language-server plugins.

Plugin capabilities can include language servers, external agents, codegen targets, routers, listener endpoints, app-subsystem backends, watch-code backends, UI settings, canvas controls, and project data.

Strategic meaning:

> Setta can become a host for specialized workflow/language/app projections without bloating core.

## JSON Render App Generation

There is a first-party JSON Render app-generation plugin. It acts as an app-subsystem provider and stores AppSpec-style app definitions under plugin data/app spec paths. It supports app generation chat modes and app deployment runtime.

Strategic framing:

> JSON Render should be treated as one projection/export path from Setta's structured project state, not the core thesis.

Current caveat:

> The feature is intentionally plugin-owned and should not be marketed as the main reason Setta exists until validation/preview/binding/deploy quality is strong.

## Mobile Direction

Planned/desired direction:

- chat-first mobile experience,
- control desktop/server-hosted Setta instances,
- machine/worktree/project selection,
- review active work,
- approve/steer runs,
- inspect artifacts/logs.

Market caveat:

> Mobile remote control of coding agents is now table stakes. OpenAI Codex, Claude Code Remote Control, Cursor web/mobile agents, and other tools are converging on remote agent supervision. Setta's mobile story must be about structured workflow review/approval/artifacts, not merely remote coding-agent control.

## Competitive Context

The AI coding market is converging around:

- coding agents,
- mobile/web remote control,
- worktrees/machine selection,
- terminal streaming,
- diff review,
- approvals,
- background agents,
- MCP integration,
- multi-agent orchestration.

Examples:

- OpenAI Codex mobile can connect to active machines/environments and review outputs, approvals, diffs, terminal output, test results, plugins, and project context.
- Claude Code Remote Control connects mobile/web to local sessions, with filesystem, MCP servers, tools, project config, remote messages, reconnection, and push notifications.
- Cursor has background agents and web/mobile agent surfaces.
- OpenCode is an open-source coding agent for terminal/IDE/desktop with LSP, multi-session, provider flexibility, and sharing.
- T3 Code positions itself as an open-source control plane for coding agents across Claude Code, Codex, OpenCode, and Cursor.
- MCP's 2026 roadmap emphasizes production needs such as transport scalability, agent communication, governance, enterprise readiness, audit trails, SSO auth, gateway behavior, and configuration portability.

Implication:

> Setta should not compete as another coding-agent control plane unless it has a sharper structural layer.

## Blunt Strategic Assessment

Setta is potentially compelling, but not automatically.

The compelling wedge is:

> AI writes code. Setta makes code operable.

Setta's differentiated layer is not syntax generation. It is structured operation:

- expose what matters from code,
- turn params into reliable controls,
- preserve project structure,
- scope agent context,
- provide operator-facing views,
- capture artifacts and run history,
- let non-authors operate complex workflows safely.

The weakest version of Setta:

> A powerful infinite canvas where developers manually wire lots of primitives.

The strongest version:

> A structured control surface that turns real repos into repeatable, inspectable, shareable, AI-operable tools.

## Biggest Missing Ingredients

1. A first-class "Create Control Surface From Repo" onboarding flow.
2. A generalized user-facing Runs ledger, not only managed chat/state-machine run records.
3. Productized Operator Views with a very clean handoff story.
4. Visible scoped-agent permissions and boundaries.
5. A small set of canonical templates/demos that prove the product.
6. Strong artifact/run comparison/replay behavior.
7. A portable "tool capsule" packaging story for Setta projects.
8. Multi-language workflow maturity beyond Python-first code watching/codegen.
9. A mobile cockpit focused on approvals, artifacts, and runs.
10. Clear positioning that avoids "another AI coding IDE" and "another app generator".

## Suggested One-Line Positioning

> Setta turns real codebases into live control surfaces that humans and agents can operate safely.

Alternative:

> A structured AI workspace for code-backed tools.

Alternative:

> A control surface for code and agents.

## What To Ask The Reviewer

Please evaluate:

1. Is this category understandable, or too abstract?
2. Who is the sharpest initial ICP?
3. Which missing ingredient is most likely to create retention?
4. Would "Run Ledger + Operator Views + Scoped Agents" be enough to differentiate?
5. Is repo-to-control-surface the right first-run wedge?
6. Should JSON Render remain secondary, or could app export become a stronger wedge?
7. What would make this feel indispensable rather than just powerful?
8. What should be cut or deprioritized?

