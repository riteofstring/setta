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

Run the last production build when dogfooding Setta while editing this repo:

```sh
./scripts/prod_desktop.sh --build
./scripts/prod_desktop.sh
```

The production launcher uses the compiled Electron bundle and a compiled
backend binary under `desktop/out`; it does not rebuild unless `--build` is
passed. Set `SETTA_APP_DATA_DIR` when you want a separate dogfood profile.

Record a production desktop dogfood session:

```sh
./scripts/prod_record_desktop_session.sh
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
./scripts/dev_record_desktop_session.sh
```

Recordings are written under `.recordings/` by default.

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
./scripts/test_topic_conversation_workflows.sh
./check_quality.sh --all
./scripts/check_supply_chain.sh
```

`pnpm -C desktop run test:electron:built` runs the required Electron workflow
manifest against temporary app data after the app has been built. Use
`node desktop/tests/electron/run-workflows.mjs --list` to inspect the registered
workflow names and tiers.

`./scripts/test_topic_conversation_workflows.sh` runs the deterministic
topic-conversation workflow and the live backend Codex workflow when the local
Codex CLI is signed in with ChatGPT auth; the live-provider skip is printed
explicitly when ChatGPT auth is unavailable. Use `--visible` to debug with
windows shown, `--deterministic-only` or `--live-only` to narrow the gate, and
`--keep-artifacts` to retain prior recordings.
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

External provider contracts are checked in at exact upstream commits and are
advanced intentionally. OpenAI's snapshot, Setta's supported-operation/event
registry, and its generated Go/TypeScript surfaces live under
`internal/speech/openaischema`, `internal/speech/openai_contract_gen.go`, and
`desktop/src/generated/openai-realtime.ts`. To update them, first change the
commit in `internal/speech/openaischema/UPSTREAM`, check out that exact commit in
an `openai/openai-openapi` clone, and run:

```sh
OPENAI_OPENAPI_REPO=/path/to/openai-openapi ./scripts/refresh_openai_api_schema.sh
```

The refresh fails if the checkout commit, selected endpoint media contracts,
speech model/voice/format, transcription settings, or Realtime event
discriminators no longer match. Exact live response media types are also owned
by that registry and emitted into both generated surfaces; the live workflow
validates provider representations that are more specific than the OpenAPI
media declaration. Do not edit either generated output directly.
The schema gate is complemented by a real provider workflow because published
OpenAPI metadata and the live wire can change at different times:

```sh
./scripts/test_live_openai_speech.sh
```

The live workflow uses temporary app data and exercises production
Electron/main/preload/renderer/HTTP/store paths through OpenAI synthesis and a
WebRTC transcription session. It requires `OPENAI_API_KEY` in the environment
or the ignored repository `.env` file.

Codex uses the parallel pinned snapshot at
`internal/codexapp/protocolschema/UPSTREAM`. Advance its commit, check out the
same commit in a local Codex clone, then regenerate with:

```sh
CODEX_REPO=/path/to/codex ./scripts/refresh_codex_protocol_schema.sh
```
