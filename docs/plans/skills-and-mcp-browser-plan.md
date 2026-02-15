# Skills + MCP Browser Plan

This document proposes a pragmatic "Skills" system and UI for Setta, plus a dedicated MCP browser.

Motivation:

- Users will bring their own favorite agent ecosystems into Setta (Codex, custom agents, etc).
- Those ecosystems often already have skill folders (for example `~/.agents/skills`).
- Setta should be able to consume skills from multiple locations without forcing a single canonical folder.
- The file browser is not a great UX for "enable/disable + preview + ordering" workflows, so Setta likely needs a first-class Skills view.

The initial scope is Setta-only enable/disable (do not try to "install skills" into other tools).

## Goals

- Support skills stored in multiple places (project-local and user-global skill folders).
- Provide a left-pane Skills browser:
  - Discover + search skills.
  - Preview the skill content.
  - Enable/disable skills.
  - Order enabled skills deterministically.
  - Jump to the underlying files in the file browser.
- Make enabled skills affect the AI prompt composition for the project chat surface (and later other chat surfaces).
- Provide a left-pane MCP browser:
  - Browse configured MCP servers.
  - Browse/search their tools.
  - Show connection/status and where config lives.
- Keep scanning and UI performant (assume large workspaces and large skill roots).
- Keep behavior deterministic and debuggable (what skills were active, in what order, with what content).

## Non-goals (Initial)

- Marketplace, remote skill discovery, auto-updates, ratings.
- Running arbitrary skill-provided code/scripts automatically.
- A general plugin system (see `docs/plans/plugin-system-plan.md` for the broader approach).
- Modifying external agent configuration folders. Setta should be a consumer, not an editor, by default.

## Current Constraints / Context (Feb 2026)

- Setta already has a first-class AI chat surface in the Overview pane.
- Setta already has an MCP system and a multi-server MCP client.
- MCP servers are configured via `setta_files/llm_config.json` (see `docs/reference/mcp-system-overview.md`).
- `setta_files/` is gitignored runtime metadata; anything that must be shared via git should not live there.

## Core Idea

Add a first-class "Extensions" concept with two concrete initial surfaces:

1. Skills (prompt/instruction packs) that can be enabled/disabled and ordered.
2. MCP servers/tools (execution surface) that can be browsed and configured.

Treat both as:

- Discovered from one or more user-configured "roots".
- Presented in dedicated left-pane views (not the generic file browser).
- Stored in Setta-owned config (enablement state), without modifying third-party folders.

## Skills

### What is a skill (MVP)

A skill is a directory containing a `SKILL.md` file.

This is intentionally compatible with existing "agents" patterns and keeps the barrier to entry near zero.

Optional future additions:

- `setta.skill.json` manifest for metadata (id, name, version, tags, entrypoints).
- Extra folders such as `templates/`, `snippets/`, `prompts/` that Setta can surface as copy/insert helpers.

### Skill discovery roots

Setta should support multiple skill roots. Proposed defaults (configurable):

- Project-local, shareable: `<workspace>/.setta/skills/` (or `<workspace>/skills/` if you want it more visible).
- Project-local, agent-compat: `<workspace>/.agents/skills/` (optional).
- User-global (examples): `~/.agents/skills/`, `~/.codex/skills/`.

Notes:

- In share mode (web-deployed), external roots should be disabled by default; only workspace-local roots are allowed.
- Each root should support exclude rules to avoid scanning expensive trees (`node_modules`, `.git`, build outputs).

### Skill identity and collisions

MVP identity should be stable and unambiguous:

- `skillRef = <rootId>::<relativePathToSkillDir>`

Where:

- `rootId` is a stable identifier stored in settings (not just the literal path string).
- `relativePathToSkillDir` is normalized path from the root to the folder containing `SKILL.md`.

If/when a manifest exists with a declared `id`, prefer it for display but keep the path-based identity for resolution.

Collision handling:

- If two skills end up with the same displayed id/name, show both and surface the source root + path in the list.

### Enable/disable model (Setta-only)

Enabling a skill means:

- Include its `SKILL.md` text as a structured block in the AI system prompt for the selected Setta AI surface (starting with project chat).
- Do not copy or modify the skill files.
- Do not enable it in other agent tools (Codex, Cursor, etc).

Ordering:

- The enabled skills list order is the prompt injection order.
- UI must allow deterministic ordering (drag/drop or up/down buttons).

Scopes:

- User-level: default roots; optional "default enabled skills".
- Project-level: enabled/ordered skills list for the project (recommended).
- Thread-level: optional override later (enable skills for a single chat thread).

### Prompt composition

When producing the system prompt for a chat request:

1. Start with the base Setta system prompt.
2. Add any project prompt content (if Setta supports it).
3. Append enabled skills, in order, as explicit delimited blocks.

Suggested delimiting (easy to debug and safe for the model):

```text
<setta_skill id="rootId::path/to/skill">
...SKILL.md content...
</setta_skill>
```

This should also be visible in the UI (for transparency):

- "Prompt preview" should show what blocks are active.
- The chat thread metadata should persist the resolved list of skillRefs used for the first message in a thread.

### Skills UI (Left Pane)

Add a new left-pane view: **Skills**.

Key layout:

- Search/filter input.
- "Active skills" section:
  - Ordered list (drag/drop).
  - Toggle enable/disable.
  - Quick jump to open the `SKILL.md` in the file browser.
- "All skills" section:
  - Virtualized list (assume lots of skills).
  - Shows: name (derived from folder name or manifest), short description (first paragraph), source root label.
  - Click shows details pane/preview.
- Details/preview:
  - Render markdown preview (or plain text initially).
  - Show path + root.
  - Buttons: enable, open folder, open file.

Root configuration UX:

- A small "Roots" subpanel (or link to settings):
  - List configured roots.
  - Add root (folder picker).
  - Remove root.
  - Rescan button.

AI-assisted root changes:

- The AI can propose "Add this folder as a skill root" or "Enable these skills", but Setta must require a user confirmation click before applying.

### Performance considerations

- Scan roots on the backend and cache results.
- Use file watchers for incremental updates where possible.
- Avoid reading full `SKILL.md` contents for the list view; read on-demand for preview.
- Add simple pruning rules while scanning (skip `.git`, `node_modules`, `dist`, `build`, `setta_files`).
- Virtualize lists in the UI to avoid large DOMs.

### Security considerations

For MVP, skills are read-only text.

If/when skills can declare "actions" (scripts, commands, MCP calls):

- Skills must declare required capabilities explicitly in a manifest.
- Setta must require an explicit user confirmation for any state-changing operation.
- Do not auto-execute anything purely from "skill enabled".

## MCP Browser

Add a new left-pane view: **MCP** (or "Tools").

The purpose is discoverability, debugging, and configuration transparency.

### MCP UI (Left Pane)

Key layout:

- Servers list:
  - Server id/name.
  - Transport (SSE/HTTP/stdio).
  - Status (connected/disconnected/error).
  - Tool counts (init vs discoverable if available).
  - "Where is this configured?" (path + link to open config file).
- Tools browser:
  - Search input (local filter; optionally re-use the server-side tool search).
  - Tool list shows namespaced tool name `<serverId>__<toolName>`.
  - Tool details shows schema + docstring summary.

### Enable/disable model (MVP)

Start with browse-only:

- Show what servers are configured and which ones are selected by the active LLM config.
- Show what tools exist and their schemas.

Later phases can add:

- Per-project default server sets.
- Quick "test tool" execution with a small argument form.

### Where MCP config lives

Current source of truth is `setta_files/llm_config.json`:

- `mcpServers`: registry.
- `defaultMcpServerIds`: global default selection.
- `AllLLMConfigs[].mcpServerIds`: per-LLM override.

The MCP browser should treat that as the canonical config unless/until a dedicated config surface is introduced.

## Storage / Types (Proposed)

### User settings (roots)

Store:

- `skillRoots: Array<{ rootId: string; path: string; label: string; excludes: Array<string> }>`

This should be user-global (not per project).

### Project settings (enabled skills)

Store:

- `enabledSkills: Array<{ skillRef: string; enabled: boolean }>`

The ordering of the array is the injection ordering.

If Setta supports multiple project configs, store this per project config id.

Note: whether this project setting is committed or stored in `setta_files` is a product decision:

- If you want teams to share enabled skills, it must live in a committed file (for example `.setta/project.json`).
- If you want it as a personal preference, it can live in `setta_files`.

## Implementation Phases

### Phase 1: Skills browse + enable (project chat only)

- Backend: scan roots and expose `list_skills`, `get_skill_content`.
- Frontend: left-pane Skills view with search, preview, enable/disable, ordering.
- Backend chat: prompt builder composes enabled skills into the system prompt.
- Persist: store enabled skills list in project-level config/state.

### Phase 2: Roots management + incremental updates

- Add UI to add/remove roots and set excludes.
- Add rescan button and optional filesystem watcher refresh.
- Add clear debug surface:
  - "Why is this skill showing up?"
  - "Where did this content come from?"

### Phase 3: MCP browser (read-only)

- Frontend: MCP view listing servers and tools.
- Backend: expose aggregated tool lists and per-server status to the UI.

### Phase 4: MCP configuration UX (optional)

- Provide UI to edit `mcpServers` and server selection in a safer structured editor.
- Provide per-project server selection overrides.

## Open Questions

- Where should project-level enabled skills live for the common case:
  - committed `.setta/...` (team-shared)
  - `setta_files/...` (personal)
  - both (committed defaults + local overrides)
- Should Setta ship a default project-local folder (`.setta/skills/`) automatically?
- Should skills be enabled globally for all chats, or only for project chat initially?
- Do we want a manifest format immediately, or defer until we need richer metadata and permissions?
- Should the left pane have separate "Skills" and "MCP" tabs, or one "Extensions" tab with internal subtabs?

