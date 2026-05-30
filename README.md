# Setta

Setta 3 is a local-first Electron app with a Go backend and TypeScript
frontend.

## Development

Try the Electron app locally:

```sh
./update_dependencies.sh
./scripts/dev_desktop.sh
```

The desktop dev command starts the Electron shell. The Electron main process
starts the Go backend automatically, so a separate backend terminal is not
required.

For throwaway local app state:

```sh
SETTA_APP_DATA_DIR="$(mktemp -d)" ./scripts/dev_desktop.sh
```

Record a desktop dogfood session:

```sh
./scripts/record_desktop_session.sh
```

Recordings are written under `.recordings/` by default.

The convenience script checks the repo Go wrapper and then runs:

```sh
pnpm -C desktop dev
```

Run the Go backend directly only for backend-only or manual API development:

```sh
./scripts/go.sh run ./cmd/setta-backend
```

If the repo Go wrapper cannot find the required Go version, install the
repo-local toolchain:

```sh
./scripts/install_go_toolchain.sh
```

Run verification:

```sh
./scripts/run_go_tests.sh
pnpm -C desktop test
pnpm -C desktop build
./scripts/test_desktop_integration.sh
./check_quality.sh --all
./scripts/check_supply_chain.sh
```

`./check_quality.sh --all` also runs the desktop Electron integration checks
after the production desktop build. The integration checks launch Electron
against temporary app data, not `~/.setta`.

Regenerate Go-owned TypeScript contracts after changing HTTP endpoint contracts
or their owning Go types:

```sh
./scripts/go.sh run ./cmd/generate-contracts
```

HTTP endpoint request and response contracts are discovered from the Go endpoint
registry in `internal/httpapi`; add endpoints there instead of editing the
contract generator.
