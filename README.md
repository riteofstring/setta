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

To reset the default global app state:

```sh
./scripts/reset_global_setta_state.sh
./scripts/reset_global_setta_state.sh --yes
```

The first command is a dry run. The reset script refuses to follow a symlinked
state directory, refuses to run while a Setta backend appears active, and does
not touch workspace-local `.setta` directories. It clears backend app data under
`~/.setta`, including workspace UI layout state under `~/.setta/workspaces`,
and Setta Electron user data.

Record a desktop dogfood session:

```sh
./scripts/record_desktop_session.sh
```

Recordings are written under `.recordings/` by default.
The recording script uses an isolated `SETTA_APP_DATA_DIR` under the recording
directory, enables workflow graph debug recording with
`SETTA_WORKFLOW_GRAPH_DEBUG=1`, and writes graph `graph_snapshot`,
`graph_interaction`, `graph_layout_save`, and `graph_replacement` events to
`renderer-events.jsonl`. Set `SETTA_RECORD_USE_EXISTING_APP_DATA=1` to record
against existing app data; without that opt-in, any pre-set `SETTA_APP_DATA_DIR`
is ignored for manual recordings.

The convenience script checks the repo Go wrapper and then runs:

```sh
pnpm -C desktop dev
```

The repo-owned supply-chain release-age policy lives in
`supply_chain_policy.env`. `./update_dependencies.sh` and
`./scripts/check_supply_chain.sh` read that file directly, and
`./configure_supply_chain.sh --local-only --days 7` updates the policy plus
package-local pnpm config files such as `desktop/.npmrc`. Environment
variables do not override the checked-in release-age policy.

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
pnpm -C desktop run test:electron:built
./scripts/test_chat_workflows.sh
./check_quality.sh --all
./scripts/check_supply_chain.sh
```

`pnpm -C desktop run test:electron:built` runs the required Electron workflow
manifest against temporary app data after the app has been built. Use
`node desktop/tests/electron/run-workflows.mjs --list` to inspect the registered
workflow names and tiers.

`./scripts/test_chat_workflows.sh` is the chat-specific compatibility wrapper.
It delegates Electron workflow selection to the manifest and runs the live
backend Codex workflow automatically when the local Codex CLI is signed in with
ChatGPT auth; the live-provider skip is printed explicitly when ChatGPT auth is
unavailable. Use `--visible` to debug with windows shown, `--deterministic-only`
or `--live-only` to narrow the gate, and `--keep-artifacts` to retain prior
recordings. Scripted Electron harness modes are test-only and require
`SETTA_E2E=1` with `SETTA_E2E_CHAT_HARNESS=scripted-workflow`.
`./check_quality.sh --all` runs the required Electron workflow manifest after
the production desktop build.

Regenerate Go-owned TypeScript contracts after changing HTTP endpoint contracts
or their owning Go types:

```sh
./scripts/go.sh run ./cmd/generate-contracts
```

HTTP endpoint request and response contracts are discovered from the Go endpoint
registry in `internal/httpapi`; add endpoints there instead of editing the
contract generator.
