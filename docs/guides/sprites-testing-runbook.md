# Sprites Testing Runbook

A top-to-bottom guide to testing Setta's hosted Sprites work, ordered from free
and instant to expensive and billable. Stop at whatever level answers your
question.

**Read this first:** stages 1–3 cost nothing and touch no cloud resources.
Stage 4 creates **real, billable Sprites**. Do not run stage 4 casually, and
never skip its cleanup step.

---

## Stage 0 — Prerequisites

Run from the repository root:

```bash
cd ~/Documents/_projects/setta.setta-3-sprites
```

| Need | Check | Notes |
| --- | --- | --- |
| Pinned Go toolchain | `./scripts/go.sh version` | Always use `./scripts/go.sh`, never bare `go`. |
| Desktop deps | `cd desktop && pnpm install` | Only needed once, or after a dependency change. |
| Codex CLI signed in | `codex login status` | Required for stage 3 only. Must be **ChatGPT auth**, not an API key. |
| Sprites token | see stage 4 | Required for stage 4 only. |

You do **not** need to set `TMPDIR` anymore. Socket path length was fixed for
both the Go tests and the Electron fixtures. If you ever see
`bind: invalid argument` or `control-plane fixture exited before ready`, that
regression is back — see the troubleshooting section.

---

## Stage 1 — Fast checks (2–5 minutes, free)

Answers: *did anything obviously break?*

```bash
# 1. Everything compiles
./scripts/go.sh build ./...

# 2. Static analysis
./scripts/go.sh vet ./...

# 3. The packages that matter for Sprites
./scripts/go.sh test -count=1 \
  ./internal/sprites/ \
  ./internal/runtimeprovider/... \
  ./internal/hostedmeasurement/ \
  ./internal/runtimeinstall/ \
  ./internal/controlplane/ \
  ./internal/runtime/ \
  ./internal/unixsockettest/
```

**Expect:** every line `ok`. `runtimetest` reporting `[no test files]` is normal.

Before committing anything:

```bash
./scripts/format.sh
./check_quality.sh --git-changes
```

**Expect:** exit code 0. Use `--all` instead of `--git-changes` for broad or
release-like changes.

---

## Stage 2 — The app itself (10–15 minutes, free)

Answers: *does it actually work for a person?*

### 2a. Run the desktop app

```bash
cd desktop
pnpm build
pnpm dev
```

**Try specifically:** open a workspace, start a conversation, send a message,
watch output stream back, cancel mid-run, and reload the app to confirm the
conversation survived.

### 2b. Check the new disk guard

Setta now refuses to start new agent turns when free storage is under
**1024 MiB**. This is new behavior — it used to be off by default on desktop.

To see it work, start the backend with an artificially high threshold so it
triggers on a healthy disk:

```bash
./scripts/go.sh run ./cmd/setta serve --minimum-disk-free-mib 999999999
```

**Expect:** new turns are refused with a clear typed reason
(`runtime_disk_pressure`), not a crash or a vague error.

To confirm the opt-out still works:

```bash
./scripts/go.sh run ./cmd/setta serve --minimum-disk-free-mib 0
```

**Expect:** no disk guard at all; turns run normally.

### 2c. The scripted end-to-end workflow

This drives the real Electron app, main process, renderer, HTTP layer and a real
control plane, with a fake provider. No cloud resources.

```bash
cd desktop && pnpm build && cd ..
node desktop/tests/electron/run-workflows.mjs --workflow hosted-cloud-chat --skip-build
```

**Expect:** `passed: hosted-cloud-chat`. Takes ~3–4 minutes.

Run the whole required tier instead:

```bash
node desktop/tests/electron/run-workflows.mjs --tier required
```

List everything available:

```bash
node desktop/tests/electron/run-workflows.mjs --list
```

---

## Stage 3 — Live Codex gates (5–10 minutes, uses your ChatGPT quota)

Answers: *does it work against a real AI provider?*

These need Codex signed in with **ChatGPT authentication**. They must not run
with `OPENAI_API_KEY` set — unset it explicitly.

```bash
# Three Go gates: agent protocol, side isolation, topic conversation
env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 ./scripts/go.sh test -count=1 \
  ./internal/agent/ ./internal/conversation/ ./internal/runtime/ \
  -run 'Live' -v

# Fourth gate: the live Electron workflow
env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 \
  node desktop/tests/electron/run-workflows.mjs --workflow live-codex-electron --skip-build
```

**Expect:** all pass. **Watch for `SKIP`** — a skip means auth was unavailable
and the gate proved nothing. Do not treat a skip as a pass.

Run these whenever you touch conversations, run lifecycle, queueing, steering,
approvals, streaming, or turn admission.

---

## Stage 4 — Live Sprites (SPENDS REAL MONEY)

Answers: *does it work against the real provider?*

> **Warning.** Every script here creates real, billable Sprites. Always run the
> cleanup phase, and always confirm afterwards that nothing was left behind.
> A stranded Sprite bills until someone notices, and today nothing sweeps for
> forgotten machines automatically.

### Credentials

Scripts resolve the token from `SPRITE_TOKEN`, falling back to the Sprites CLI
keychain entry on macOS (needs `jq`). To be explicit:

```bash
export SPRITE_TOKEN='...'
```

### 4a. Lifecycle — the simplest real run (start here)

Self-contained: it sets `SETTA_LIVE_SPRITES=1` itself, builds a Linux lease
probe, creates a Sprite, exercises it, and tears it down.

```bash
./scripts/test_sprites_lifecycle.sh
```

**Expect:** `TestLiveLifecycle` passes. Allow up to 35 minutes.

**This is the run to watch, not just check.** Notice how long provisioning
takes, whether it feels invisible, and whether any failure is explainable.

### 4b. Cold soak — behavior over time

State directory must be **outside the repo** and empty for `prepare`.

```bash
state="$(mktemp -d "${TMPDIR:-/tmp}/setta-sprites-cold-soak.XXXXXX")"

SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh prepare     --state "$state"
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh observe     --state "$state"
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh verify-due  --state "$state"
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh cleanup     --state "$state"   # never skip
```

### 4c. Full measurement campaign — the expensive one

Phased, with cohorts run explicitly and in order. `init-manifest` is offline and
creates an editable manifest you must fill in before anything live runs.

```bash
state=/absolute/path/outside/repo/measurement

# Offline: create and then edit the manifest
./scripts/test_sprites_live_measurement.sh init-manifest --state "$state" --prefix myprefix

# Live phases
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_live_measurement.sh prepare --state "$state"
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_live_measurement.sh measure-retained-filesystem --state "$state"
# ... other cohorts, in order ...
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_live_measurement.sh observe --state "$state"
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_live_measurement.sh cleanup --state "$state"   # never skip
```

Cohorts, in order: `retained-filesystem`, `attached-idle`,
`renewable-workload`, `terminal-build`, `terminal-build-preview`,
`storage-checkpoints`, `hostile-cutoff`, `beta-concurrency`.

Full usage: `./scripts/test_sprites_live_measurement.sh --help`

### 4d. After ANY live run — verify nothing was left behind

Until automated reconciliation exists, do this by hand using the Sprites CLI:

```bash
sprite list
```

**Expect:** no Sprites carrying your run prefix or a `setta-managed` label.
Anything left over is billing you right now. Destroy it.

---

## Operator tools (helping a customer)

Requires the control-plane admin socket path.

```bash
setta-control-plane admin inspect-runtime-metadata --socket <path> --runtime-name <name>
setta-control-plane admin set-runtime-access        --socket <path> --runtime-name <name> --access-state <state>
setta-control-plane admin request-runtime-wake      --socket <path> --runtime-name <name>
setta-control-plane admin schedule-runtime-deletion --socket <path> --runtime-name <name> --scheduled-at <time>
setta-control-plane admin cancel-runtime-deletion   --socket <path> --runtime-name <name>
setta-control-plane admin revoke-device             --socket <path> --device-id <id>
setta-control-plane admin set-user-status           --socket <path> ...
setta-control-plane admin set-user-budget           --socket <path> ...
```

Full list: `setta-control-plane admin` with no arguments.

**Known limitation:** every command requires an identifier you must already
know. There is no list or search. You cannot currently look up a customer's
machines from their account, and nothing enumerates what the provider actually
has. This is a known gap, not a missing flag.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `bind: invalid argument` on a socket | Path over the 104-byte `sun_path` limit | Route the test through `internal/unixsockettest`. Do not pin `TMPDIR` in a script. |
| `control-plane fixture exited before ready` | Same limit, Electron side | Fixture must use `createElectronFixtureTempRoot()`. |
| Live Codex tests `SKIP` | ChatGPT auth unavailable, or `OPENAI_API_KEY` set | `codex login status`; re-run with `env -u OPENAI_API_KEY`. |
| Go tests fail only on your machine | Environment-dependent path length | Compare against a short `TMPDIR` before calling it a regression. |
| Electron workflow times out | Machine under load | Re-run the single workflow in isolation before treating it as a regression. |

---

## Quick reference

| I want to... | Run |
| --- | --- |
| Check nothing broke | `./scripts/go.sh build ./... && ./scripts/go.sh vet ./...` |
| Test Sprites code | `./scripts/go.sh test -count=1 ./internal/sprites/...` |
| Pre-commit gate | `./scripts/format.sh && ./check_quality.sh --git-changes` |
| Use the app | `cd desktop && pnpm build && pnpm dev` |
| End-to-end, no cloud | `node desktop/tests/electron/run-workflows.mjs --tier required` |
| Real AI provider | `env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 ...` |
| Real Sprite (costs money) | `./scripts/test_sprites_lifecycle.sh` |
| Confirm no orphans | `sprite list` |
