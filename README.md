# Setta

Setta 3 currently contains the phase 1 platform skeleton: a local Go backend,
an Electron desktop shell, a typed preload bridge, and a WebContentsView browser
pane proof.

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

Run the browser pane automation smoke:

```sh
pnpm -C desktop smoke:browser
```

Regenerate Go-owned TypeScript contracts after changing the owning Go types:

```sh
./scripts/go.sh run ./cmd/generate-contracts
```
