# Phase 31 Packaged Python Surface And Dependency Rerank

## Purpose

This doc records the next broader rerank after the landed Phase 30 closeout.

Phase 30 confirmed that the active backend/runtime, launcher, startup, and
distribution ownership tracks no longer select another Go runtime phase. The
next honest question is narrower and different: what Python package surface do
we still ship to users, and does that shipped package boundary itself now
select a follow-on track?

## Current Status

Completed before this rerank:

- caller-backed backend runtime/transport rewrite closeout
- startup/distribution closeout in
  `phase-29-post-phase-28-startup-and-distribution-rerank.md`
- broader ownership closeout in
  `phase-30-post-phase-29-broader-rewrite-rerank.md`

What this rerank adds:

- an explicit inventory of what the built Python distribution still ships
- an explicit inventory of which remaining Python dependencies are still active
  for the shipped product versus source/dev workflows
- a decision on whether packaged Python surface slimming is now the next
  evidence-backed rewrite track

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-30-post-phase-29-broader-rewrite-rerank.md`
- `docs/plans/go-backend-rewrite/pyproject-dependency-replacement-snapshot.md`
- `docs/reference/dev-vs-built.md`
- `docs/reference/remote-built-install.md`
- `docs/reference/external-agents.md`
- `pyproject.toml`
- `hatch_build.py`
- `backend/setta/__main__.py`
- `backend/setta/entrypoint.py`
- `backend/setta/dev_start.py`
- `backend/setta/server.py`
- `backend/setta/startup_runtime.py`
- `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py`
- `backend/setta/agentic/external_adapters/sidecars/package.json`
- `internal/externalagents/claude_executor.go`
- `internal/externalagents/opencode_executor.go`
- `internal/codeformat/python.go`
- `internal/lsp/current_process.go`
- `scripts/build_python_distribution_with_go_binaries.sh`
- `tests/start/test_packaged_distribution.py`
- `tests/start/test_module_entrypoint.py`
- `tests/start/test_distribution_script_wiring.py`

## Inventory Method

1. Re-read the current rewrite roadmap and the landed broader closeout docs.
2. Re-read the build metadata that defines what wheel/sdist artifacts contain.
3. Re-read the packaged Python entrypoint and the explicit source/dev start
   entrypoint.
4. Re-read the current Go owners that still intentionally execute Python tools
   or Python sidecars.
5. Re-read the relevant packaging and module-entrypoint tests to confirm what
   the repo currently treats as shipped behavior.

## Findings

### 1. The built distribution still ships the full `backend/setta` Python package

Current packaging boundary:

- `[tool.hatch.build.targets.wheel].packages = ["backend/setta"]`
- `[tool.hatch.build.targets.sdist].include` still includes `/backend/setta`
- `hatch_build.py` only hardens packaged Go binary presence and wheel tagging;
  it does not narrow the Python module set

Rerank implication:

- the current wheel and sdist still carry the full Python package tree
- the broader runtime rewrite closeout did not automatically become a packaged
  Python surface closeout

### 2. The active packaged command boundary is much narrower than the shipped Python tree

Current packaged command path:

- `python -m setta` and the `setta` console script dispatch through
  `backend/setta/entrypoint.py`
- that dispatcher resolves `backend/setta/go_bin/setta` and executes the
  packaged Go CLI
- `tests/start/test_module_entrypoint.py` now treats that thin Go dispatch as
  the shipped behavior contract

Rerank implication:

- the active packaged command surface is explicit and small
- most of the still-shipped Python package no longer sits on the main packaged
  user command path

### 3. Some shipped Python content remains intentionally active for the product

Current active shipped Python edges:

- the Claude executor launches the checked-in Python sidecar under
  `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py`
- the OpenCode executor launches the checked-in Node sidecar under the same
  sidecar tree
- the packaged artifact list still deliberately preserves
  `backend/setta/agentic/external_adapters/sidecars/**`
- Go still shells out to `ruff` in `internal/codeformat/python.go`
- Go still shells out to `basedpyright` through the current-process Python LSP
  owner in `internal/lsp/current_process.go`

Rerank implication:

- packaged Python is not reducible to only `entrypoint.py` plus `go_bin`
- any package-boundary slimming must preserve:
  - explicit sidecar assets and their Python dependencies
  - explicit Python tool dependencies that the Go runtime still invokes

### 4. The same Python distribution still carries the dev-only backend server owner

Current source/dev path:

- `frontend/backendStart.sh` uses `python -m setta.dev_start` for reload
- `backend/setta/dev_start.py` imports `backend/setta/startup_runtime.py`
- `backend/setta/dev_start.py` launches `uvicorn` against `backend/setta/server.py`
- `backend/setta/server.py` still imports the legacy Python router/runtime tree

Rerank implication:

- the shipped Python distribution currently mixes:
  - the packaged-user boundary
  - the explicit source/dev reload boundary
  - legacy/reference Python modules imported by that dev-only server
- this coupling is the main reason the root Python dependency surface remains
  much broader than the packaged end-user command surface

### 5. The root runtime dependency list is now broader than the packaged-user boundary

Current evidence:

- active packaged Python/tool edges still justify some dependencies:
  - `claude-agent-sdk`
  - `mcp`
  - `ruff`
  - `basedpyright`
- the explicit source/dev reload boundary still justifies some dependencies:
  - `click`
  - `fastapi`
  - `uvicorn`
- many remaining root dependencies are now present because the full legacy
  Python runtime still ships and remains importable from the same package tree

Rerank implication:

- the remaining selected work is no longer backend route/runtime migration
- it is package/dependency boundary work: separating active packaged ownership
  from source/dev-only and legacy/reference Python baggage

### 6. This now selects a new focused follow-on track

Unlike the Phase 30 result, this rerank does select a concrete next track:

- the Python distribution boundary itself is now the remaining evidence-backed
  ownership surface
- the first follow-on should not be broad Python cleanup
- it should be an explicit packaged Python boundary slimdown plan with wheel
  contents and dependency shape treated as first-class owned outputs

## Decisions Made

- open a new Phase 31 planning track for packaged Python surface and dependency
  slimming
- treat this as packaging/distribution ownership, not as a reopened backend
  runtime rewrite
- preserve the deliberate active Python edges:
  - packaged Go CLI thin dispatcher
  - external-agent sidecars
  - Python tool executables still invoked by Go
  - explicit source/dev reload ownership until a later slice changes it

## Verification

- `git diff --check`

## Next Recommended Step

Use `phase-31-packaged-python-boundary-slimdown-plan.md` as the next focused
working doc.

The recommended first slice is:

- make the wheel boundary explicit before touching dependency lists
- prove wheel contents in tests
- then narrow Python dependency ownership from that explicit boundary instead of
  deleting imports heuristically
