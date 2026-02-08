# `setta_files`: Local vs Global State

Setta stores runtime metadata under a `setta_files/` folder. There are two locations:

- **Local `setta_files`**: `<workspace>/setta_files` (default)
- **Global `setta_files`**: a per-workspace folder under a configurable base directory

Local always wins when it exists.

## Setta Home (`<setta_home>`)

`<setta_home>` is the per-user Setta directory that contains the config file.

- macOS/Linux: `~/.setta`
- Windows: `%APPDATA%\\Setta`
- Override: `SETTA_HOME=/custom/path`

## Config File

Config lives at `<setta_home>/config.json`.
Setta will create the file with defaults on first start (when possible). If the
file is missing, Setta uses the defaults shown below.

```json
{
  "globalSettaFilesBase": "~/.setta/setta_files",
  "openWorkspaceFallback": "create_local",
  "defaultCreateLocation": "local"
}
```

Fields:

- `globalSettaFilesBase`
  - directory that will contain per-workspace global state folders
  - default: `<setta_home>/setta_files`
- `openWorkspaceFallback`
  - `create_local`: if the workspace has no local `setta_files/`, Setta will create/use `<workspace>/setta_files`
  - `use_global_if_present`: if the workspace has no local `setta_files/`, Setta will use the global state folder if it already exists, otherwise it will defer to `defaultCreateLocation`
- `defaultCreateLocation`
  - `local` or `global`
  - only used when opening a workspace that has no local `setta_files/` and no existing global state (and `openWorkspaceFallback=use_global_if_present`)

## How Setta Chooses a `setta_files` Root

Resolution rules:

1. If `<workspace>/setta_files` exists and is a directory: **use local**.
2. Otherwise, choose based on the requested location:
   - `local`: use `<workspace>/setta_files`
   - `global`: use `<globalSettaFilesBase>/<workspace-name>-<hash>`
   - `auto`: follow `openWorkspaceFallback` + `defaultCreateLocation` from config

The global folder name is deterministic per workspace path, and looks like:

`<workspace-name>-<8-hex-digest>`

## CLI / Env Overrides

You can force the selection without editing the config:

- CLI: `--setta-files-location {auto,local,global}`
- Env: `SETTA_FILES_LOCATION={auto,local,global}`

The `/api/launch` request also supports `settaFilesLocation: auto|local|global`.

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
  "globalSettaFilesBase": "~/setta_state",
  "openWorkspaceFallback": "use_global_if_present",
  "defaultCreateLocation": "global"
}
```
