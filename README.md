# Setta

Setta is a visual app/workflow environment with a React frontend, a Go backend,
and a Python package surface for CLI dispatch, source SDKs, and packaging.

## Repo shape

- `cmd/setta` and `cmd/setta-server` are the CLI and server entrypoints.
- `internal/` owns the backend runtime, HTTP/ws transports, state, services,
  codegen, packaging helpers, and frontend binding generation.
- `backend/setta/` is the Python package and SDK surface:
  - `python -m setta` / installed `setta` dispatch through
    `backend/setta/entrypoint.py`
  - `backend/setta/api/*` contains the source Python SDK/runtime helpers
    (`SettaListener`, `ListenerHotReloader`, `chat_toolkit`, `SettaRunner`)
  - package-level helpers such as `local_core_client.py`, `runtime_compat.py`,
    and `plugin_runtime/*` are thin Go-backed/package-facing surfaces shipped
    in the wheel
  - packaged assets, sidecars, and bundled binaries still ship from here
- `plugins/` contains first-party Setta plugin packages, including
  package-managed language-server plugins, the Watch Code provider, the JSON
  Render app-subsystem provider, and their manifests/config schemas.
- `frontend/` contains the Vite/React UI and generated TS bindings.
- `tests/` contains Python/package pytest coverage; Go tests are
  co-located under `cmd/*` and `internal/*`.

## Dev loop

Default setup:

```sh
./dev_install.sh
./scripts/run-dev-instance.sh
```

Refresh dependency lockfiles explicitly when dependency manifests change:

```sh
./update_dependencies.sh
```

Common commands:

- `./scripts/go.sh test ./... -count=1` or `./scripts/run_go_tests.sh`
- `./scripts/run_backend_tests.sh`
- `pnpm -C frontend exec vitest run`
- `./scripts/run-playwright-e2e.sh`
- `./build.sh`
- `./verify_install.sh`

`./dev_install.sh` also creates the repo Python environment used for package
tooling, tests, and the first-party defaults plugin. Activate it when you need
direct Python/package commands:

```sh
source activate.sh
```

`dev_install.sh` uses frozen installs and should not rewrite lockfiles.

On a fresh workspace, the repo-local defaults install profile bootstraps
`setta-basedpyright` as the selected Python language server when that
first-party plugin is available. Watch Code is available through the optional
first-party `setta-watch-code` plugin. See
[`docs/reference/plugin-language-servers.md`](docs/reference/plugin-language-servers.md).

## Packaging boundary

The shipped package is a Python wheel that dispatches into packaged Go
binaries:

- installed `setta` and `python -m setta` resolve through the package
  entrypoint wrapper
- the wrapper dispatches into packaged Go binaries under `backend/setta/go_bin`
- the slim wheel includes dispatch plus package-facing runtime helpers; broader
  source-only Python SDK modules stay outside the packaged-user install path
- source-checkout dev flows run the Go entrypoints directly through
  `./scripts/go.sh`

## Docs

- [Docs overview](docs/README.md)
- [Dev quickstart](docs/guides/dev-quickstart.md)
- [Dev scripts](docs/guides/dev-scripts.md)
- [Dev vs built runtime](docs/reference/dev-vs-built.md)
- [Worktree dev quickstart](docs/guides/worktree-dev-quickstart.md)
