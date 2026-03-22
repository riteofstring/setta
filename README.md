# Setta

Setta is a visual app/workflow environment with a React frontend, a Go-owned
backend runtime, and a retained Python source/package boundary for entrypoint
wrappers, source-side SDKs, and packaging.

## Repo shape

- `cmd/setta` and `cmd/setta-server` are the active Go CLI/server entrypoints.
- `internal/` owns the backend runtime, HTTP/ws transports, state, services,
  codegen, packaging helpers, and frontend binding generation.
- `backend/setta/` is the retained Python source/package surface:
  - `python -m setta` / installed `setta` dispatch through
    `backend/setta/entrypoint.py`
  - `backend/setta/api/*` keeps the retained source/sdist Python SDK
    (`SettaListener`, `ListenerHotReloader`, `chat_toolkit`, `SettaRunner`)
  - packaged assets, sidecars, and bundled binaries still ship from here
- `frontend/` contains the Vite/React UI and generated TS bindings.
- `tests/` contains retained Python/compatibility pytest coverage; Go tests are
  co-located under `cmd/*` and `internal/*`.

## Dev loop

Default Go-first setup:

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

Python tooling is opt-in for repo work that touches the retained Python
boundary or packaging flows:

```sh
. ./dev_install_python.sh
source activate.sh
```

## Packaging boundary

The shipped package is still a Python wheel, but the active runtime inside that
package is Go:

- installed `setta` and `python -m setta` resolve through the retained Python
  wrapper
- the wrapper dispatches into packaged Go binaries under `backend/setta/go_bin`
- the source-only Python SDK modules stay outside the slim wheel install path
- source-checkout dev flows run the Go entrypoints directly through
  `./scripts/go.sh`

## Docs

- [Docs overview](docs/README.md)
- [Dev quickstart](docs/guides/dev-quickstart.md)
- [Dev scripts](docs/guides/dev-scripts.md)
- [Dev vs built runtime](docs/reference/dev-vs-built.md)
- [Merge-readiness cleanup checklist](docs/plans/go-backend-rewrite/merge-readiness-cleanup-checklist.md)

Rewrite/parity cleanup work lives under
[`docs/plans/go-backend-rewrite/`](docs/plans/go-backend-rewrite/README.md);
that doc set is for merge-prep and retained-boundary work, not the default
contributor entrypoint.
