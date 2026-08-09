# `setta_files`: Local vs Global State

Setta stores runtime metadata under a `setta_files/` folder. There are two locations:

- **Local `setta_files`**: `<workspace>/setta_files` (default)
- **Global `setta_files`**: a per-workspace folder under a configurable base directory

Local `setta_files` wins when it exists, except when an explicit `setta_files_root`
override is selected (CLI, env, or profile).

## Setta Home (`<setta_home>`)

`<setta_home>` is the per-user Setta directory that contains the config file.

- Canonical names only: `<setta_home>` must end with `.setta` or `.setta-development`.
- macOS/Linux default: `~/.setta`
- Dev scripts default: `~/.setta-development`
- Windows recommended override: `SETTA_HOME=%APPDATA%\\.setta`
- Override example: `SETTA_HOME=/abs/path/to/.setta-development`

## Canonical Naming Rules

Path resolution enforces canonical naming for state roots:

- `setta_home` must end with `.setta` or `.setta-development`.
- resolved `setta_files_root` must include a folder segment named `setta_files` or `setta_files_dev`.
- This applies to explicit overrides (`--setta-home`, `--setta-files-root`) and to config-driven global roots (`globalSettaFilesBase`), because global roots are derived from that base.

## Config File

Config lives at `<setta_home>/config.json`.
Setta will create the file with defaults on first start (when possible). If the
file is missing, Setta uses the defaults shown below.

```json
{
  "globalSettaFilesBase": "~/.setta/setta_files",
  "autoMode": "create_local"
}
```

Fields:

- `globalSettaFilesBase`
  - directory that will contain per-workspace global state folders
  - default: `<setta_home>/setta_files`
- `autoMode`
  - `create_local`: if the workspace has no local `setta_files/`, Setta will create/use `<workspace>/setta_files`
  - `use_global_if_present`: if the workspace has no local `setta_files/`, Setta will use the global state folder if it already exists; otherwise it will create/use `<workspace>/setta_files`
  - `create_global`: if the workspace has no local `setta_files/`, Setta will create/use the computed global state folder

## How Setta Chooses a `setta_files` Root

Resolution rules:

1. If an explicit `setta_files_root` is provided (CLI/env/profile): **use it**.
2. Otherwise, if `<workspace>/setta_files` exists and is a directory: **use local**.
3. Otherwise, choose based on the requested location:
   - `local`: use `<workspace>/setta_files`
   - `global`: use `<globalSettaFilesBase>/<workspace-name>-<hash>`
   - `auto`: follow `autoMode` from config

The global folder name is deterministic per workspace path, and looks like:

`<workspace-name>-<8-hex-digest>`

## Plugin Files and Roots

Plugin data spans workspace, `setta_files`, and `setta_home` roots:

- Plugin install roots by scope:
  - `workspace`: `<workspace>/.setta_plugins/<plugin-id>`
  - `setta_files`: `<setta_files_root>/plugins/<plugin-id>`
  - `global`: `<setta_home>/plugins/<plugin-id>`
- Plugin runtime/state files:
  - `<setta_files_root>/plugins_state.json`
  - `<setta_files_root>/plugins_install_metadata.json`
  - `<setta_files_root>/plugins_history/`
  - `<setta_files_root>/plugins_runtime/`
  - `<setta_home>/plugins_global_state.json`
  - `<workspace>/.setta_plugins/plugins.lock.json`

## Runtime Profiles

Profiles are optional JSON files at:

- `<setta_home>/profiles/<profile-name>.json`

Select a profile with:

- CLI: `--profile <name>`
- Env: `SETTA_PROFILE=<name>`

Supported profile fields:

- `name` (optional, must match the selected profile filename when provided)
- `workspaceRoot`
- `settaHome`
- `settaFilesRoot`
- `settaFilesLocation` (`auto|local|global`)
- `runtimeRoot`
- `authCookieName`

Profile rules:

- Relative profile paths are resolved relative to `<setta_home>`.
- `settaFilesRoot` and `settaFilesLocation` are mutually exclusive.
- Canonical naming rules apply after profile resolution.

Advanced profile lookup override:

- `SETTA_PROFILE_LOOKUP_HOME` controls where profile files are looked up.
- This can differ from the resolved runtime `settaHome`.

## Override Precedence

Highest precedence first:

1. Explicit CLI/API request values.
2. Selected profile values.
3. Environment variables.
4. User config + local/global auto-resolution defaults.

## CLI / Env Overrides

You can force the selection without editing the config:

- CLI:
  - `--profile <name>`
  - `--setta-home <path>`
  - `--setta-files-root <path>`
  - `--setta-files-location {auto,local,global}`
  - `--runtime-root <path>`
- Env:
  - `SETTA_PROFILE`
  - `SETTA_HOME`
  - `SETTA_FILES_ROOT`
  - `SETTA_FILES_LOCATION`
  - `SETTA_RUNTIME_ROOT`

`--setta-files-root` and `--setta-files-location` are mutually exclusive.

The `/api/launch` request supports:

- `profile`
- `settaHome`
- `settaFilesRoot`
- `settaFilesLocation` (`auto|local|global`)
- `runtimeRoot`

## API Helpers

In IDE mode, the launcher UI uses:

- `GET /api/settaHomeInfo` ->
  ```json
  {
    "settaHome": "...",
    "globalSettaFilesBase": "...",
    "activeSettaFilesLocation": "local|global|custom",
    "llmConfigPath": ".../setta_files/llm_config.json"
  }
  ```
  - `activeSettaFilesLocation` is `custom` when `setta_files_root` is explicitly set.

Skills/MCP discovery UI also uses:

- `POST /api/revealPathInOsFileExplorer` with `{ "path": "..." }`
  - Allowed roots are restricted to workspace root, resolved `setta_files` root,
    and discovered skill roots.

## Managed LLM API keys (`./.env`)

LLM provider definitions and key values live in different places:

- Provider/model definitions: `<setta_files_root>/llm_config.json`
- Managed API key values: `<workspace>/.env`

Setta tracks managed key ownership in `.env` with:

- `SETTA_MANAGED_LLM_API_KEY_NAMES`: JSON array of env var names currently managed by Setta.

Managed key route contract:

- `GET /api/llm/apiKeys`
  - Returns `{ apiKeys, revision }`.
  - `apiKeys` is the effective key map (configured process env keys + Setta-managed keys).
- `POST /api/llm/apiKeys`
  - Request: `{ apiKeys, expectedRevision }`.
  - Uses compare-and-set semantics (`expectedRevision` must match current managed-key revision).
  - Returns `{ apiKeys, revision }` on success.

Error responses for managed key routes:

- `409` with `errorCode=managed_api_keys_store_corrupt`
- `409` with `errorCode=managed_api_keys_revision_conflict`
- `503` with `errorCode=managed_api_keys_store_unavailable`

## Examples

Use local state (default):

```sh
setta
```

Force global state for a single run:

```sh
SETTA_FILES_LOCATION=global setta --workspace /path/to/workspace
```

Prefer global state for new workspaces (via config):

```json
{
  "globalSettaFilesBase": "~/.setta/setta_files_dev",
  "autoMode": "create_global"
}
```
