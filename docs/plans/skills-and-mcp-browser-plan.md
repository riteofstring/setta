# Chat-Scoped Skills + MCP Plan (Canonical)

This plan updates the previous "dedicated browser first" approach. Skills and MCP selection are now primarily configured in chat-context surfaces, with global browsing/settings used for defaults and diagnostics.

## Goals

- Make Skills and MCP selection primarily chat-scoped.
- Support the flow: click a Chat section -> open right-side `Section Config` -> choose Skills and MCP servers.
- Keep chat sections opt-in by default for both Skills and MCP.
- Add a `Capabilities` view in Project AI chat (next to `History`) so users can configure that chat directly.
- Keep a lightweight global surface for source management, defaults, and MCP runtime diagnostics.

## Product Direction

1. Primary selectors live where users chat:
   - Chat section config: `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
   - Project AI chat: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
2. Chat sections default to no added capabilities:
   - Skills mode default: `disabled`
   - MCP mode default: `disabled`
3. Project chat adds a top-level `Capabilities` view near `History`.
4. A dedicated Overview browser is optional, not required for MVP.

## UX Flows

### Chat Section (Right Panel)

1. User selects a Chat section on canvas.
2. User opens `Ui Editor` -> `Section Config`.
3. `ChatAreaSettings` shows an `AI Capabilities` block:
   - `Use Skills in this chat section` toggle.
   - `Use MCP servers in this chat section` toggle.
   - If enabled, show multi-select lists.
   - Optional: `Use global defaults` vs `Custom selection`.
4. When both toggles are off, section runs without skill/MCP augmentation.

### Project AI Chat (Left Panel)

1. In `ProjectChat`, add `Capabilities` button beside `History`.
2. `Capabilities` renders two internal tabs:
   - `Skills`
   - `MCP`
3. Selection applies to current project chat context (existing thread or new-thread draft).

## Policy Model

Use one model for both skills and MCP selection:

- `mode: "disabled" | "inherit" | "custom"`
- `enabledSkillIds: string[]`
- `enabledMcpServerIds: string[]`

Effective resolution:

- `disabled` -> empty set
- `inherit` -> global defaults
- `custom` -> explicit selected IDs (validated)

Defaults:

- Chat section defaults: `disabled`
- Project chat default: `inherit` (recommended)

## Skill and MCP Catalog

Global catalog/data still exists and is shared by all selectors.

Skill sources:

- `./skills` (workspace local)
- `~/.codex/skills`
- `~/.agents/skills`
- custom roots

Skill identity:

- `skillRef = <rootId>::<relativePathToSkillDir>`

Catalog behavior:

- Scan `**/SKILL.md`
- Parse metadata and surface parse errors explicitly
- Keep large-list support fast (filtering + virtualization in UI)

MCP catalog/runtime:

- Use LLM config source of truth for configured servers
- Show runtime status separately (`connected`, `error`, tool count, refresh time)

## Backend Plan

### Types

- `SkillSource`
- `SkillEntry`
- `SkillCatalogResponse`
- `CapabilityPolicy`
- `McpServerRuntimeState`

### Endpoints (Proposed)

- `getSkillSources`
- `setSkillSources`
- `getSkillsCatalog`
- `getSkillDetails`
- `getGlobalCapabilityDefaults`
- `setGlobalCapabilityDefaults`
- `getChatSectionCapabilityPolicy`
- `setChatSectionCapabilityPolicy`
- `getProjectChatCapabilityPolicy`
- `setProjectChatCapabilityPolicy`
- `getMcpServersRuntimeState`

### Persistence

- `setta_files/skills_config.json`:
  - skill sources
  - global default skill IDs
  - global default MCP server IDs
- Chat section capability policy:
  - persisted with chat section settings/metadata
- Project chat capability policy:
  - persisted in project chat metadata keyed by chat id (or draft state before first message)

## Frontend Plan

### Chat Section Settings

- Extend `ChatAreaSettings.tsx` with `AI Capabilities` controls.
- Keep controls disabled when section/permissions are read-only, consistent with existing settings behavior.

### Project AI Chat

- Extend `ProjectChat.tsx` to support `Capabilities` view state in addition to current chat/history views.
- Add `ProjectChatCapabilities.tsx` for Skills/MCP internal tabs and selectors.

### Optional Global Surface

If retained, global surface should focus on:

- managing skill roots
- managing global default selections
- MCP diagnostics (status/tool visibility)

This can be an Overview tab or settings modal. It should not be required for basic per-chat setup.

## Runtime Enforcement

- Resolve effective IDs immediately before run execution:
  - chat section run -> section policy
  - project chat run -> project chat policy
- Inject resolved IDs into run context for both managed LLM and external-agent paths.
- Reject unknown IDs clearly when a selected item was removed or invalidated.

## Testing + Verification

### Backend

- Skill source scan across multiple roots
- Invalid `SKILL.md` error surfacing
- Capability policy CRUD and resolution
- Section policy and project-chat policy separation
- MCP runtime state behavior

### Frontend (Vitest)

- `ChatAreaSettings` capability controls and mode transitions
- `ProjectChat` view switching (`Chat`, `History`, `Capabilities`)
- Selector persistence and precedence (`disabled`, `inherit`, `custom`)

### Playwright

- Chat section -> config -> enable/choose skills and MCP -> send -> verify applied context
- Project chat -> capabilities -> choose skills and MCP -> send -> verify applied context
- Removed skill/server handling (selected item unavailable) shows explicit UI state

### CDP Visual Check (Implementation Phase)

- Verify right-side section config controls
- Verify project chat `Capabilities` view + tab layout
- Verify optional global diagnostics surface if implemented

## Rollout

1. Backend catalog/default/policy APIs and persistence
2. Chat section `AI Capabilities` controls
3. Project chat `Capabilities` view
4. Optional global diagnostics/defaults surface

## Why Keep Any Global Browser/Settings?

Per-chat configuration is the primary workflow, but a thin global surface is still useful for:

- managing skill roots
- default enablement
- viewing parse/config errors
- MCP connectivity diagnostics

That global surface should be support tooling, not the main way users assign capabilities to chats.
