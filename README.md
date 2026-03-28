# Setta

Setta is a visual app/workflow environment with a React frontend, a Go backend,
and a Python package surface for CLI dispatch, source SDKs, and packaging.

## Repo shape

- `cmd/setta` and `cmd/setta-server` are the CLI and server entrypoints.
- `internal/` owns the backend runtime, HTTP/ws transports, state, services,
  codegen, packaging helpers, and frontend binding generation.
- `backend/setta/` is the Python package surface:
  - `python -m setta` / installed `setta` dispatch through
    `backend/setta/entrypoint.py`
  - `backend/setta/api/*` contains the Python SDK
    (`SettaListener`, `ListenerHotReloader`, `chat_toolkit`, `SettaRunner`)
  - packaged assets, sidecars, and bundled binaries still ship from here
- `frontend/` contains the Vite/React UI and generated TS bindings.
- `tests/` contains Python/package pytest coverage; Go tests are
  co-located under `cmd/*` and `internal/*`.

## Dev loop

Default setup:

```sh
./dev_install.sh
./scripts/run-dev-instance.sh
```

Common commands:

- `./scripts/go.sh test ./... -count=1` or `./scripts/run_go_tests.sh`
- `./scripts/run_backend_tests.sh`
- `pnpm -C frontend exec vitest run`
- `./scripts/run-playwright-e2e.sh`
- `./build.sh`
- `./verify_install.sh`

Python tooling is opt-in for repo work that touches the Python package surface
or packaging flows:

```sh
. ./dev_install_python.sh
source activate.sh
```

## Packaging boundary

The shipped package is a Python wheel that dispatches into packaged Go
binaries:

- installed `setta` and `python -m setta` resolve through the package
  entrypoint wrapper
- the wrapper dispatches into packaged Go binaries under `backend/setta/go_bin`
- the source-only Python SDK modules stay outside the slim wheel install path
- source-checkout dev flows run the Go entrypoints directly through
  `./scripts/go.sh`

## Docs

- [Docs overview](docs/README.md)
- [Dev quickstart](docs/guides/dev-quickstart.md)
- [Dev scripts](docs/guides/dev-scripts.md)
- [Dev vs built runtime](docs/reference/dev-vs-built.md)
- [Worktree dev quickstart](docs/guides/worktree-dev-quickstart.md)
