# External agent settings files plan

This plan defines how Setta will specify and optionally modify the native settings
files for the three external agents we support: Claude Code (SDK), Codex (SDK),
and OpenCode (SDK).

## Goals
- Rely on each tool's native settings/config system as much as possible.
- Let users define ask/deny rules for risky actions using the tool's native
  settings when available.
- Keep Setta in control of MCP wiring without clobbering user configs.
- Provide a predictable, user-friendly default that does not silently edit
  repository files.
- Make settings behavior visible in the UI and persisted in Setta metadata.

## Non-goals
- Building a full settings editor for each external tool.
- Editing global/user-level settings by default.
- Enforcing Setta-specific policy when a user explicitly opts into native
  tool settings that conflict.

## Current behavior (summary)
- Claude Code: Setta writes a temporary `.mcp.json` and passes `mcpConfig`, but
  does not pass `setting_sources`, so Claude settings are effectively ignored.
- Codex: Setta writes a temporary `config.toml` and points the SDK via `CODEX_HOME`.
- OpenCode: Setta writes a temporary `opencode.json` and points via `OPENCODE_CONFIG`.

## Key decisions
- Prefer native settings files. If a tool supports an official settings file,
  use it rather than re-implementing rules in Setta.
- Default to "read existing settings, do not write" unless a user explicitly opts in.
- When Setta must write settings, use a managed block and preserve user edits.
- All settings file writes are project-local and opt-in.

## Proposed config model changes

### New fields in ExternalAgentConfig
- `settingsMode`: enum per tool. Default is `read_only`.
  - `read_only`: do not write files, only read existing tool settings.
  - `managed_local`: write a local settings file intended for a single machine.
  - `managed_project`: write a project settings file intended for sharing.
  - `explicit_path`: use a user-provided settings file path (no writes unless
    `allowSettaEdits` is true).
- `settingsSources` (Claude only): list of `["project", "local", "user"]` to pass
  through to the SDK `setting_sources`.
- `settingsFilePath`: explicit path for Codex/OpenCode configs when using
  `explicit_path`.
- `settingsAllowSettaEdits`: boolean to allow Setta to merge managed settings
  into an existing file.
- `settingsManagedBlock`: structured content that Setta owns and can update.

### Optional new settings schema
Define typed settings models rather than `dict[str, Any]`:
- `ClaudeSettingsManaged`
  - `permissions`: `{ allow: [string], ask: [string], deny: [string] }`
  - `defaultMode`: optional string
  - `mcp`: optional structured settings (if Claude exposes native MCP settings)
- `CodexSettingsManaged`
  - `approvalPolicy`: string
  - `sandboxMode`: string
  - `enabledTools`: list of strings
  - `model`: optional string
- `OpenCodeSettingsManaged`
  - `permission`: map of tool patterns -> allow/ask/deny
  - `mcp`: map of server entries
  - `model`: optional string

## Settings file strategy per tool

### Claude Code (SDK)
Constraints:
- The SDK loads settings from standard locations via `setting_sources`.
- There is no "settings file path" option; settings must live under `.claude/`.

Plan:
1) Add `setting_sources` to the Claude SDK options.
   - Default to `["project", "local"]` if `settingsMode` is not `read_only`,
     otherwise still set it to read existing `.claude` files if they exist.
2) If `settingsMode == managed_local`, write `.claude/settings.local.json` in
   the project root.
3) If `settingsMode == managed_project`, write `.claude/settings.json` in the
   project root.
4) Store all Setta-managed rules under a reserved top-level key, for example:
   `"setta": { "permissions": { ... } }`, and merge with existing settings.
5) Avoid editing `.claude/settings.json` unless explicitly selected by the user.
6) Keep the existing `.mcp.json` path for MCP wiring.

Merge rules:
- If the file exists and `settingsAllowSettaEdits` is false, do not modify it.
- If Setta edits are allowed, only update the managed block.
- Do not delete user-defined keys outside the managed block.

UX:
- Add a "Claude settings source" selector:
  - Read existing only
  - Manage local settings file
  - Manage project settings file
- Add an "Ask/Deny rules" editor that writes into the managed block.
- Add an info note: "Setta will only edit `.claude/settings.local.json` or
  `.claude/settings.json` if you opt in."

### Codex (SDK)
Constraints:
- Codex is configured via a TOML file in the SDK home directory.
- We already control `CODEX_HOME` and can point to a Setta-managed directory.

Plan:
1) Replace per-run temp config with a stable, per-config settings dir:
   `setta_files/external_agent_settings/codex/<config-id>/config.toml`.
2) If `settingsMode == explicit_path`, read that file and merge the Setta-managed
   block; write to a Setta-managed output file and point `CODEX_HOME` there.
3) Ensure the Setta-managed block always contains:
   - `[mcp_servers.setta]` entry
   - `enabled_tools` for allowlists
   - `approval_policy`, `sandbox_mode`, `model` if set in Setta config
4) Keep user-defined sections intact.

Merge rules:
- Use a TOML parser; do not string-concatenate.
- Only modify the Setta-managed block and MCP server entry.
- If user denies Setta edits, use the file as-is and only layer in MCP via an
  overlay file in Setta-managed directory.

UX:
- Add "Codex settings mode" + optional "settings file path".
- Show where the generated config lives and a "Open file" link.

### OpenCode (SDK)
Constraints:
- OpenCode uses a JSON config and reads from `OPENCODE_CONFIG`.

Plan:
1) Replace per-run temp config with a stable path:
   `setta_files/external_agent_settings/opencode/<config-id>/opencode.json`.
2) If `settingsMode == explicit_path`, read and merge into a Setta-managed
   output file.
3) Ensure Setta-managed block contains:
   - `mcp` entry for Setta server
   - `permission` map derived from allowlists + approval policy
4) Preserve any user-defined keys.

Merge rules:
- Read/merge JSON with a structured merge function.
- Only Setta-managed block is mutated by Setta.

UX:
- Add "OpenCode settings mode" + optional "settings file path".
- Show where the generated config lives.

## Runtime behavior changes
- ExternalAgentRunner builds settings file paths once per config and reuses them
  across runs (no temp churn).
- Claude adapter sets `setting_sources` in SDK options.
- Codex/OpenCode adapters use stable config paths and re-generate files on
  config changes.
- Record settings mode + paths in run metadata for auditability.

## File locations and naming
- Claude:
  - Project: `<project-root>/.claude/settings.json`
  - Local: `<project-root>/.claude/settings.local.json`
- Codex:
  - `setta_files/external_agent_settings/codex/<config-id>/config.toml`
- OpenCode:
  - `setta_files/external_agent_settings/opencode/<config-id>/opencode.json`

## Safety and user expectations
- Default is read-only (no file edits).
- Any write into `.claude/` requires explicit opt-in.
- Provide a UI preview of changes when Setta edits an existing file.
- When writing `.claude/settings.local.json`, suggest adding it to `.gitignore`
  (do not auto-edit `.gitignore` without opt-in).

## Migration plan
- Existing configs continue to work with no changes if `settingsMode` is left
  unset (defaults to `read_only`).
- Add new fields to `external_agents.json` with defaults.
- Migrate the per-run temp configs for Codex/OpenCode to stable paths without
  changing effective behavior.

## Testing plan
- Unit tests for settings merge logic per tool.
- Tests for file path resolution and opt-in enforcement.
- Manual verification:
  - Claude uses `.claude` rules when `setting_sources` is set.
  - Codex/OpenCode pick up stable config files and MCP wiring.
  - Permission rules work for at least one known risky command scenario.

## Open questions
- Should Claude default to `setting_sources=["project","local"]` even when
  `settingsMode=read_only`, or only when the user explicitly enables it?
- Do we need a global "always allow Setta to edit tool settings" preference?
- How should we communicate conflicts between Setta-managed permissions and
  user-defined rules?
