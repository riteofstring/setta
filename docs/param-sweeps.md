# Param Sweeps

This doc explains how to run parameter sweeps against a Setta project using the
Python runner API. Sweeps are implemented as detached runs with parameter and
variant overrides applied to a snapshot of the project state.

## Prerequisites

- Start Setta in the target workspace (share mode does not support detached runs).
- Use a Python environment that can import `setta`.
- Run your sweep script from the same workspace, or pass auth credentials.

SettaRunner authenticates in this order:
- `auth_headers` (explicit headers you pass in).
- `bootstrap_token` (from the UI or `setta status --connect-info`).
- `SETTA_SESSION_ID` + optional `SETTA_SESSIONS_ROOT`.
- The newest local session for the workspace (default when you run inside it).

## Identify params and variants

`SettaRunner.summary()` returns a lightweight view of sections and params so you
can resolve human-friendly names into IDs.

```python
from setta.api import RunPlan, RunOverride, SettaRunner

runner = SettaRunner(project_name="My Project")
summary = runner.summary()

lr = summary.params.by_name("Training", "learning_rate")
batch = summary.params.by_name("Training", "batch_size")

model = summary.section("Model")
variant_ids = model.variants.by_name(["resnet50", "vit_small"])
```

Notes:
- `by_name()` accepts section display names and param display names.
- If you already have IDs, you can use raw `(section_id, param_id)` tuples.

## Build a sweep plan

`RunPlan` expands a list of `RunOverride` objects. Every method returns a new
plan, so you can chain them.

Grid search across parameters:
```python
plan = RunPlan().grid_params({
    lr: ["1e-3", "3e-4"],
    batch: ["32", "64"],
})
```

Zip params (paired lists of equal length):
```python
plan = RunPlan().zip_params({
    lr: ["1e-3", "3e-4"],
    batch: ["32", "64"],
})
```

Random sampling:
```python
plan = RunPlan().random_params(
    {lr: ["1e-2", "1e-3", "3e-4"], batch: ["16", "32", "64"]},
    count=5,
    seed=42,
)
```

Loop over section variants:
```python
plan = plan.loop_section_variants(
    section_id=model.id,
    variant_ids=variant_ids,
)
```

Add tags or other overrides by starting with a base `RunOverride`:
```python
base = RunOverride(tags={"sweep": "lr-batch"})
plan = RunPlan([base]).grid_params({lr: ["1e-3"], batch: ["32", "64"]})
```

## Run the sweep

```python
run_ids = []
for override in plan:
    response = runner.run_detached(override)
    run_ids.append(response.runId)
```

If Python codegen is disabled, you must set `entry_section_id` on the override
(or pass `entry_section` to `run_detached`) and the section must be Python or
Bash.

## Monitor or cancel runs

```python
status = runner.get_run_status(run_ids[0])
# status.status is one of: queued, running, exited, failed, canceled, lost

runner.cancel_run(run_ids[0])
```

Run metadata and stdout are stored under:
- `setta_files/runs/<run_id>/meta.json`
- `setta_files/runs/<run_id>/stdout.log`

Snapshots are written to:
- `setta_files/run/_<timestamp>/` when `RunSnapshotMode.ephemeral` (default)
- `setta_files/code/_<timestamp>/` when `RunSnapshotMode.always`

Detached runs always snapshot; `RunSnapshotMode.never` is rejected.

## Tips

- Overrides are stored as strings. Use the same literal format you would type
  into the UI (for example, switches expect `"true"`/`"false"`).
- Prefer `summary.params.by_name()` over hard-coding IDs so sweeps survive
  renames.
- Use `for_project_configs(["Config A", "Config B"])` if you want to sweep
  multiple project configs.
