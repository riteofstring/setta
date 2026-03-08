# Phase 30 Post-Phase-29 Broader Rewrite Rerank

## Purpose

This doc records the broader rerank after the landed Phase 29
startup/distribution closeout.

The question is no longer whether the startup/distribution track still hides a
selected rewrite slice. It does not. The broader rewrite question is now
whether any active shipped or active repo-local workflow still selects another
concrete Go ownership phase outside that closed track.

## Current Status

Completed before this rerank:

- caller-backed backend runtime/transport rewrite closeout
- startup/distribution closeout in
  `phase-29-post-phase-28-startup-and-distribution-rerank.md`

What this rerank adds:

- a broader inventory after the startup/distribution track closeout
- an explicit check of the remaining launcher/native-installer and dev-reload
  Python ownership
- a decision on whether another implementation phase is honestly selected now

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-25-remaining-python-ownership-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-25-startup-test-surface-classification-and-source-of-truth.md`
- `docs/plans/go-backend-rewrite/phase-29-post-phase-28-startup-and-distribution-rerank.md`
- `docs/plans/go-backend-rewrite/phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
- `docs/plans/go-backend-rewrite/phase-11-maintenance-command-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `pyproject.toml`
- `backend/setta/entrypoint.py`
- `backend/setta/__main__.py`
- `backend/setta/dev_start.py`
- `backend/setta/server.py`
- `backend/setta/start.py`
- `backend/setta/startup_runtime.py`
- `backend/setta/launcher_setup.py`
- `backend/setta/launcher_artifacts/`
- `frontend/backendStart.sh`
- `scripts/install_desktop_launcher.sh`
- `scripts/install_linux_launcher.sh`
- `scripts/install_macos_launcher.sh`
- `scripts/release/build_macos_installer.sh`
- `scripts/release/build_windows_installer.ps1`
- `tests/start/test_module_entrypoint.py`
- `tests/start/test_packaged_distribution.py`
- `tests/start/test_desktop_launcher_install_scripts.py`
- `tests/start/test_launcher_artifact_installers.py`
- `tests/start/test_launcher_setup.py`

## Inventory Method

1. Re-read the current rewrite roadmap and the Phase 25/29 ownership reranks.
2. Re-read the current packaged, dev-start, and Python-server entrypoints.
3. Search the repo for non-test references to the remaining Python launcher and
   startup owners.
4. Re-read representative launcher/install/release scripts and tests to
   confirm whether those Python modules are still on the active workflow path.

## Findings

### 1. The shipped CLI and launcher contract remain Go-owned

Current shipped path:

- `pyproject.toml` still publishes `setta = "setta.entrypoint:main"`
- `backend/setta/entrypoint.py` remains a thin wrapper to the packaged Go CLI
- the shipped `setta launcher ...` contract is implemented in Go through
  `cmd/setta`, `internal/settacmd`, and `internal/launcher`

Rerank implication:

- there is no remaining packaged CLI or launcher-command ownership slice to
  select
- the shipped command surface is already on the explicit Go boundary

### 2. Launcher install scripts no longer depend on the Python launcher owner

Current script path:

- `scripts/install_desktop_launcher.sh`
- `scripts/install_linux_launcher.sh`
- `scripts/install_macos_launcher.sh`

All of those scripts now invoke `setta launcher setup` on the packaged CLI
boundary instead of importing or shelling into `backend/setta/launcher_setup.py`
or `backend/setta/launcher_artifacts/*`.

Rerank implication:

- the Python launcher setup/artifact modules are no longer active workflow
  owners for the current shipped installer path
- their remaining reachability is legacy Python route/test anchoring, not an
  evidence-backed rewrite blocker

### 3. The remaining active Python server ownership is deliberate dev-only reload behavior

Current source/dev path:

- `frontend/backendStart.sh` uses `python -m setta` for normal startup
- reload uses `python -m setta.dev_start`
- `backend/setta/dev_start.py` runs `uvicorn` against `backend/setta/server.py`
  through `backend/setta/startup_runtime.py`

Rerank implication:

- the remaining active Python backend/runtime surface is explicit and
  dev-only
- there is no new rewrite slice selected unless Go dev reload ownership itself
  becomes a concrete product or workflow priority

### 4. Remaining Python launcher/setup modules are now legacy/reference coverage, not active command ownership

Repo search result:

- non-test workflow files no longer call `backend/setta/launcher_setup.py` or
  `backend/setta/launcher_artifacts/*`
- direct references remain concentrated in:
  - `backend/setta/start.py`
  - legacy Python routers
  - legacy/startup test coverage

Rerank implication:

- those modules remain reference and legacy-anchor code for now
- they do not justify opening a new rewrite phase by themselves

### 5. The broader rewrite is now at a true closeout boundary for the current scope

After the backend-route/runtime closeout, the capability reranks, the
startup/distribution closeout, and this broader post-Phase-29 pass:

- there is no caller-backed backend/runtime phase left open
- there is no shipped CLI/launcher/distribution phase left open
- the remaining Python ownership is deliberate, legacy, or dev-only

## Decisions Made

- treat the broader rewrite as effectively closed for the current clean-break
  scope
- do not open another ownership phase without a concrete active workflow,
  caller, release problem, or product-backed decision
- keep the remaining Python surfaces explicit instead of pretending they are
  hidden backend debt:
  - dev-only reload/runtime ownership
  - Python packaging boundary
  - launcher/native-installer bootstrap scripts
  - legacy Python route/test/reference coverage

## Verification

- `git diff --check`

## Next Recommended Step

Do not broaden the rewrite by inertia.

If work continues, the next honest step is a new focused phase selected by a
concrete issue or product decision. There is no evidence-backed implementation
slice to open from the current repo state alone.
