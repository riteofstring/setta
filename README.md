# Setta

Setta 3 is a local-first Electron app with a Go backend and TypeScript
frontend.

## Development

Install or refresh checked-in dependencies:

```sh
./update_dependencies.sh
```

Run the Go backend directly:

```sh
./scripts/go.sh run ./cmd/setta-backend
```

Start the desktop shell in development:

```sh
pnpm -C desktop dev
```

Run verification:

```sh
./scripts/run_go_tests.sh
pnpm -C desktop test
pnpm -C desktop build
./check_quality.sh --all
./scripts/check_supply_chain.sh
```

Regenerate Go-owned TypeScript contracts after changing HTTP endpoint contracts
or their owning Go types:

```sh
./scripts/go.sh run ./cmd/generate-contracts
```

HTTP endpoint request and response contracts are discovered from the Go endpoint
registry in `internal/httpapi`; add endpoints there instead of editing the
contract generator.
