# Meta-Scripting + Detached Sweeps Plan

This document proposes a meta-scripting SDK for sweeps and a detached run
mechanism that lets long runs continue after Setta stops.

## Goals
- Support loops over project configs, section variants, and param values.
- Allow hyperparameter-style sweeps without exploding UI complexity.
- Provide a Python SDK that can run outside the UI (separate process).
- Add a detached run mode so sweeps launched from the UI continue running if
  Setta exits.

## Non-goals (for now)
- A full sweep UI builder.
- Native Optuna integration (see Future Work).

## Current State
- Project configs select variants via `ProjectConfig.sectionVariantMap`.
- State mutation exists (`set_section_variant`, `set_param_entered_value`).
- Runs are executed in Setta-managed PTY terminals; if Setta stops, the PTY dies.
- Custom Runs in the UI only run a code block or force listener refresh.

## Proposed Architecture

### 1) Run overrides + plans
Introduce an override layer that does NOT permanently mutate project state.
The override is applied to a copy of `ProjectStateSingleConfig`, then a snapshot
run command is generated from that copy.

- RunOverride (conceptual fields)
  - projectConfigId
  - entrySectionId (optional)
  - sectionVariantOverrides: { sectionId: variantId }
  - paramOverrides: { (sectionId,paramId): value }
  - runSnapshotMode (optional)
  - tags (optional)

- RunPlan helpers
  - grid(...) / zip(...) / repeat(...) / random(...)
  - returns a sequence of RunOverride objects

### 2) Detached Run Manager (Option A)
Add a detached mode so runs continue after Setta stops.

Backend responsibilities:
- Build snapshot folder + command.
- Spawn OS process detached from Setta.
- Persist run metadata/logs under `setta_files/runs/`.
- Track status by PID + exit code on demand.

Run registry layout (suggested):
- `setta_files/runs/<run_id>/meta.json`
- `setta_files/runs/<run_id>/stdout.log`
- `setta_files/runs/<run_id>/metrics.json` (optional)

Process spawning (platform aware):
- macOS/Linux: `subprocess.Popen(..., start_new_session=True)`
- Windows: `CREATE_NEW_PROCESS_GROUP`

### 3) SDK layer
Provide a Python SDK (separate process compatible) that hits the backend APIs.

Example (proposed API):
```
from setta.api.runner import SettaRunner, RunPlan

runner = SettaRunner(project_name="Demo Project")
summary = runner.summary()

plan = (
    RunPlan()
    .for_project_configs(["Config A", "Config B"])
    .loop_section_variants(
        section_id=summary.section("Model Config").id,
        variant_ids=summary.section("Model Config").variants.by_name(
            ["Baseline", "Large"]
        ),
    )
    .grid_params({
        summary.params.by_name("Train Params", "lr"): [1e-3, 3e-4, 1e-4],
        summary.params.by_name("Train Params", "batch_size"): [16, 32],
    })
    .repeat(3)
)

for trial in plan:
    runner.run_detached(trial, entry_section="Train Code")
```

## API Additions (backend)
New endpoints (names illustrative):
- `route_run_detached` -> returns run_id
- `route_get_run_status` -> status, pid, exit code, timestamps
- `route_cancel_run` -> terminate by pid
- (optional) `route_list_runs`
- (optional) `route_run_plan` -> server-side loop + concurrency

## Backend Implementation Steps
1) Add a new module: `backend/setta/run_manager.py`
   - Create run metadata
   - Spawn detached processes
   - Record PID + start time
   - Expose status + cancel

2) Add override-aware run command creation
   - New helper: `create_run_command_with_overrides(...)`
   - Apply overrides to a *copy* of `ProjectStateSingleConfig`
   - Build `DependencyGraph` + `PythonCodeGenerator` from that copy
   - Use existing snapshot machinery in `project_state/code.py`

3) Add router endpoints
   - Extend `project_manager_types.py`
   - Add routes to `routers/terminals.py` or a new router for runs

4) Add SDK client
   - `setta.api.runner` with `run_detached(...)`
   - Uses `RouterEndpointAPI` under the hood

## Risks / Open Questions
- How to store metrics (file vs. meta control vs. emit_to_frontend).
- Concurrency limits for server-side run_plan.
- Cleanup policy for old `setta_files/runs/` entries.

## Future Work
- UI: Runs pane + “Run detached” button in Custom Runs.
- Optuna integration: thin adapter that maps trial suggestions to overrides.

## Implementation Appendix (Spec)

### Status model
- status enum: `queued | running | exited | failed | canceled`
- required fields:
  - runId
  - status
  - createdAtMs
  - startedAtMs | null
  - exitedAtMs | null
  - exitCode | null
  - pid | null
  - command
  - snapshotPath
  - projectConfigId
  - entrySectionId | null
  - tags: dict[str, str]

### Override application rules
- Do NOT mutate persistent project state.
- Apply overrides to a copy of `ProjectStateSingleConfig`.
- For `sectionVariantOverrides`:
  - If sectionId missing, raise KeyError.
  - If variantId missing, raise KeyError.
- For `paramOverrides`:
  - Expect keys as `(sectionId, paramId)` tuples or `SectionParamDependencyKey`.
  - Use `set_param_entered_value(...)` with stringified value payloads.
- Type conversion is caller responsibility (SDK formats to string literal).

### API schemas (suggested)

`RunDetachedRequest`
- projectConfigId: ID
- entrySectionId: ID | None
- runSnapshotMode: RunSnapshotMode | None
- sectionVariantOverrides: dict[ID, ID] | None
- paramOverrides: dict[str, str] | None  # encoded key: "sectionId:paramId"
- tags: dict[str, str] | None

`RunDetachedResponse`
- runId: str
- status: str

`RunStatusResponse`
- all status fields (see Status model)

`CancelRunRequest`
- runId: str

### Run registry format
`setta_files/runs/<run_id>/meta.json` (JSON)
- matches Status model fields

`setta_files/runs/<run_id>/stdout.log`
- combined stdout/stderr

`setta_files/runs/<run_id>/metrics.json`
- optional user-written metrics

### Process spawning
- Always spawn detached from Setta.
- stdout/stderr redirected to `stdout.log`.
- macOS/Linux: `subprocess.Popen(..., start_new_session=True)`
- Windows: `CREATE_NEW_PROCESS_GROUP`

### Policies
- Enforce share policy: require `allowRun`.
- Respect `runSnapshotMode` override if provided.

### File/Module placement (suggested)
- `backend/setta/run_manager.py` (new)
- `backend/setta/routers/runs.py` (new)
- `backend/setta/project_state/base_project_manager.py` (override-aware helper)
- `backend/setta/project_state/project_manager_types.py` (new request models)
- `backend/setta/types/routes.py` (new routes)

