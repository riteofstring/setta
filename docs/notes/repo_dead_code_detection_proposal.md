# Repo-Specific Proposal For Dead Code Detection

This proposal defines a repo-specific dead-code detection approach for Setta's
actual repo shape.

The goal is not "automatic deletion of anything with no in-repo callers." The goal
is a principled, low-noise way to produce dead-code candidates that can be
reviewed by a developer or a coding agent, with automated deletion used only
where the repo already has an authoritative generation story.

## Goals

- Produce candidate lists that are useful enough for agent-assisted cleanup.
- Keep root definitions tied to authoritative repo metadata instead of a large
  hand-maintained inventory.
- Separate production reachability from test-only reachability, tooling-only
  reachability, and public/package surfaces.
- Make reports machine-readable and stable enough for baselines and delta gating.
- Preserve the repo's Go-first ownership rules and generation policy.

## First-Pass Entry Points

The initial implementation is designed around a single agent-friendly command:

- `./scripts/report_dead_code.sh`

That command writes JSON reports under `reports/deadcode/` with
`aggregate.json` as the primary machine-readable output.

There are also narrow wrappers for language-specific runs:

- `./scripts/deadcode/report_go.sh`
- `./scripts/deadcode/report_python.sh`
- `./scripts/deadcode/report_frontend.sh`
- `./scripts/deadcode/list_candidates.sh`

The checked-in policy/config input is:

- `deadcode.overrides.yaml`

The expected workflow for a coding agent is:

1. Run `./scripts/report_dead_code.sh`
2. Read `reports/deadcode/aggregate.json`
3. Filter by `language`, `lane`, `bucket`, `confidence`, or `path`
4. Review candidates before deletion

The current first-pass reports include:

- `reports/deadcode/aggregate.json`
- `reports/deadcode/go-prod.json`
- `reports/deadcode/go-test.json`
- `reports/deadcode/go-tooling.json`
- `reports/deadcode/go-u1000.json`
- `reports/deadcode/python.json`
- `reports/deadcode/python-reachability.json`
- `reports/deadcode/frontend-prod.json`
- `reports/deadcode/frontend-all.json`
- `reports/deadcode/frontend-lint-unused.json`

Current first-pass caveats:

- Python reachability is advisory and comes from `vulture` filtered by smoke
  coverage gathered through repo-managed dev dependencies plus repo-owned smoke
  import roots.
- Frontend reachability compares Knip `--production` against Knip's full graph,
  then uses a repo-local import graph to classify many `prod-dead` findings as
  `test`-live or `tooling`-live. Some package/dependency findings still remain
  generic non-production evidence.

## Non-Goals

- Proving that every reported candidate is always safe to delete.
- Treating "not imported in this repo" as a sufficient definition of dead code.
- Replacing code review or runtime verification for dynamic/plugin-heavy flows.
- Auto-deleting handwritten code outside narrow generated surfaces.

## Core Model

Use two lanes.

1. Lint-unused
2. Root-based dead-code candidates

These lanes solve different problems and should produce different report buckets.

For this repo, a code unit is a strong dead-code candidate only when it is
unreachable from all supported roots in the relevant scope. The relevant scopes
are:

- `prod`: shipped runtime and packaged entrypoints
- `tooling`: generators, dev utilities, and repo-only commands
- `test`: unit, integration, and e2e roots
- `public`: documented or packaged SDK/package surfaces

That means the same symbol can legitimately land in different buckets:

- `dead`: unreachable from `prod`, `tooling`, `test`, and `public`
- `prod-dead`: unreachable from `prod`, but reachable from `tooling` or `test`
- `test-only-live`: only reachable when test roots are added
- `tooling-only-live`: only reachable from generators or repo utilities
- `public-surface-live`: retained because it is part of a documented or packaged surface
- `lint-unused`: unused local/import/parameter inside otherwise live code
- `exempt`: intentionally retained dynamic hook, generated output, compatibility shim, or external-consumption surface

## Important Repo Constraint

Do not make `deadcode.roots.yaml` the main source of truth.

That would conflict with the repo's own discovery-first guidance in
`docs/reference/generation-contracts.md`. A large hand-maintained root manifest
will rot, and once it rots the dead-code signal becomes untrustworthy.

Instead, use:

- authoritative root discovery from repo metadata
- a small checked-in override file for what cannot be discovered

The override file should stay small and policy-oriented. It should not enumerate
every root file or every retained symbol.

## Authoritative Root Sources

### Go

Discover all mains from `cmd/*/main.go`, then classify them using authoritative
repo metadata.

Production Go roots should be derived from the places that actually package or
launch shipped binaries:

- `scripts/build_packaged_go_binaries.sh` currently packages `cmd/setta` and
  `cmd/setta-server`
- `backend/setta/entrypoint.py` dispatches to `cmd/setta` and wires
  `setta-server` via `SETTA_SERVER_BIN`

Tooling Go roots should be discovered from `cmd/` and then classified by a small
override layer. In the current repo shape, these include the generator commands
under `cmd/setta-gen-*` and `cmd/setta-seed-playwright-workspace`.

One useful side effect of this model is that commands with no authoritative
runtime or packaging root become visible immediately. Today `cmd/setta-cli`
looks like that kind of candidate: it exists as a main package, but the
packaging and launcher paths root `setta` and `setta-server`, not `setta-cli`.

There is currently no checked-in public Go package surface outside `internal/`
and `cmd/`, so exported Go symbol policy is not the main problem here. For Go,
the important split is:

- production/runtime reachability
- tooling-only reachability
- internal unused declarations

### Python

Python needs two distinct scopes because the packaged wheel and the source
checkout are not the same thing.

Packaged roots should be derived from:

- `pyproject.toml [project.scripts]`
- `backend/setta/__main__.py`
- wheel packaging inputs in `pyproject.toml`

In the current repo shape, the wheel includes only a very small Python code
surface plus bundled assets and Go binaries. That means "dead in the wheel" and
"dead in the source checkout" are different questions.

Source-checkout Python roots should be derived from:

- documented SDK/public modules
- runtime helper flows documented in `docs/reference/go-backed-python.md`
- smoke and integration execution from real entrypoints

Public Python modules should be explicit. Any module treated as public should
define `__all__`. In the current tree, the most obvious public module surfaces
are re-export modules such as `backend/setta/api/__init__.py` and
`backend/setta/llm/chat_toolkit/__init__.py`.

Dynamic Python import paths must be treated as first-class retained edges or
smoke-rooted flows. The current repo has real examples:

- `backend/setta/api/hot_reload.py` uses `importlib.reload` and
  `importlib.import_module`
- `backend/setta/share/deployment_listener_process.py` loads modules from file
  paths with `spec_from_file_location`

That means Vulture alone cannot be authoritative here.

### TypeScript / React

This repo is an app, not primarily a published TypeScript package, so
`package.json exports` are not the main root source.

Production frontend roots should be derived from build metadata:

- `frontend/index.html` points to `/src/index.tsx`
- `frontend/src/index.tsx` is the app bootstrap
- lazy route imports should be discovered from the app graph, not hand-listed

The current runtime graph includes real dynamic imports:

- route-level lazy imports in `frontend/src/components/Pages/router.tsx`
- file-preview/lazy editor imports in component code
- runtime plugin frontend loading in `frontend/src/plugins/runtime.ts`

The plugin frontend loader is especially important. It imports external plugin
entrypoint URLs at runtime. That means:

- the host-side loader code is live
- external plugin bundles are not part of repo dead-code analysis
- Knip findings around plugin host surfaces need a specific exemption or dynamic-edge annotation

Test and e2e code should remain separate roots from production app roots.

## Proposed Override File

Use a small file such as `deadcode.overrides.yaml`. Keep it narrow.

It should contain only policy that cannot be derived automatically:

- supported Go build matrix
- classification overrides for discovered Go mains
- public Python modules that must define `__all__`
- dynamic import loaders and registry hooks that need explicit retention
- generated path globs
- temporary exemptions with reasons

It should not contain:

- a long list of every Go main package
- a long list of every TS route file
- per-symbol allowlists unless there is no better authoritative source

## Candidate Generators By Language

### Go

Use three tools for three different jobs.

- Go compiler and normal builds: unused imports and locals
- Staticcheck `U1000`: unused internal declarations
- `deadcode`: root-based reachability from executable mains

Run `deadcode` in separate views:

- production mains only
- production mains plus `-test`
- tooling mains only

For production reachability, only classify a symbol as a strong dead candidate
if it is dead across every supported `GOOS/GOARCH/-tags` configuration in the
checked-in build matrix.

Keep generated Go files out of dead-code gating by default. Compile them, but do
not treat them as handwritten cleanup targets.

### Python

Use three evidence sources, not one.

- Ruff for unused imports, locals, arguments, and bad `__all__` references
- targeted smoke/integration execution under Coverage.py from real roots
- Vulture as report-only candidate generation

Coverage is supporting evidence, not proof of deadness. A line not executed by a
smoke suite is only weak evidence. For Python, stronger candidates are modules
or symbols that satisfy all of these:

- not part of a declared public module surface
- not part of a documented source-checkout runtime flow
- not retained by a dynamic-edge override
- reported by Vulture or Ruff
- absent from the relevant smoke/integration execution report

Keep Vulture advisory-only. Python in this repo is too dynamic for Vulture to be
a hard gate.

### TypeScript / React

Use:

- `tsc` for unused locals and parameters
- Knip for unused exports, files, and dependency clutter

Knip should run in two modes:

- production mode for app dead-code candidates
- default or test-aware mode for dev/test visibility

Do not reuse the current `frontend/scripts/runKnip.mjs` output as the main
dead-code report. That script is intentionally mutation-oriented and focused on
generated frontend types. Keep that flow for generated cleanup, but add a
separate read-only report path for repo dead-code candidates.

## Proposed Output Format

The main product should be a machine-readable report, not just console text.

Prefer one aggregated JSON file or JSONL stream with records like:

```json
{
  "language": "go",
  "lane": "reachability",
  "bucket": "prod-dead",
  "path": "internal/example/service.go",
  "symbol": "(*Service).unusedHelper",
  "tool": "deadcode",
  "confidence": "high",
  "root_scope": "prod",
  "config": {
    "goos": "darwin",
    "goarch": "arm64",
    "tags": []
  },
  "evidence": [
    "dead across all prod configs",
    "not live under -test",
    "not classified as generated",
    "not retained by override"
  ]
}
```

Useful fields:

- `language`
- `lane`
- `bucket`
- `path`
- `symbol`
- `tool`
- `confidence`
- `root_scope`
- `config`
- `generated`
- `public_surface`
- `dynamic_edge_reason`
- `exemption_reason`
- `evidence`

This is the format a coding agent can consume safely. It gives the agent enough
context to decide whether to delete, convert to unexported/internal, move to an
exemption list, or keep for an undocumented root that needs to be made explicit.

## Confidence Levels

Use explicit confidence labels.

- `high`: compiler/Ruff/tsc unused findings; Go `deadcode` findings that remain
  dead across all supported production configs and are not test-live
- `medium`: Knip unused exports/files after config hints are clean; Python
  findings supported by Vulture plus absence from public roots and smoke runs
- `low`: anything touching dynamic imports, plugin loaders, hot reload, or
  external-consumption uncertainty

Only `high` confidence candidates should be strong candidates for automated or
mostly automated cleanup. `medium` and `low` should default to agent review.

## Repo-Specific Dynamic Edges To Model Up Front

These should be represented in the override file or in authoritative discovery.

- Go codegen and contract registries that keep types live for generation rather
  than runtime
- Python hot reload in `backend/setta/api/hot_reload.py`
- Python file-based listener loading in
  `backend/setta/share/deployment_listener_process.py`
- frontend lazy routes in `frontend/src/components/Pages/router.tsx`
- frontend runtime plugin module loading in `frontend/src/plugins/runtime.ts`

The point is not to make dynamic behavior invisible. The point is to classify it
honestly so candidate reports stay useful.

## Proposed Script Shape

Add a dedicated report pipeline instead of folding this into `check_quality.sh`
immediately.

Suggested entrypoints:

- `scripts/report_dead_code.sh`
- `scripts/deadcode/report_go.sh`
- `scripts/deadcode/report_python.sh`
- `scripts/deadcode/report_frontend.sh`
- `scripts/deadcode/aggregate_reports.py`

Suggested outputs:

- `reports/deadcode/go-prod.json`
- `reports/deadcode/go-test.json`
- `reports/deadcode/go-tooling.json`
- `reports/deadcode/python.json`
- `reports/deadcode/frontend-prod.json`
- `reports/deadcode/frontend-test.json`
- `reports/deadcode/aggregate.json`

Pin tool versions exactly in scripts. Do not use `@latest` in ongoing
automation.

## Gating Policy

Start report-only.

Immediate gates are only the low-noise lane:

- Go compiler/build failures
- Ruff unused rules
- `tsc` unused locals and parameters

After the reports stabilize, gate only on deltas for:

- new Go `U1000` findings in internal packages
- new high-confidence Go `prod-dead` findings
- new high-confidence Knip unused files/private exports

Keep Python Vulture advisory-only unless the Python surface becomes much more
static than it is today.

## Staged Rollout

### Stage 0

Define the small override file and the report schema.

### Stage 1

Add read-only per-language reporters and aggregate JSON output.

### Stage 2

Stand up the first authoritative root discovery:

- Go mains from `cmd/*/main.go`
- packaged Python roots from `pyproject.toml`
- frontend app root from `frontend/index.html` and `src/index.tsx`

### Stage 3

Add repo-specific dynamic-edge modeling:

- Python hot reload and file-based loaders
- frontend plugin runtime imports
- tooling-only Go generators

### Stage 4

Use the aggregated report as input to agent-assisted cleanup passes.

Suggested workflow:

1. Filter to `high` confidence findings.
2. Ask the agent to review one package or subsystem at a time.
3. Require normal tests after each deletion pass.
4. Convert recurring false positives into explicit overrides or public-surface declarations.

### Stage 5

Gate on net-new high-confidence debt only.

## Practical Bottom Line

The ChatGPT recommendation is directionally right about the tool stack:

- Go compiler + Staticcheck `U1000` + `deadcode`
- Python Ruff + Coverage.py + Vulture report-only
- TypeScript `tsc` + Knip

What should change for this repo is the root model.

Setta should not use a large hand-maintained root manifest. It should use
authoritative discovery plus a narrow override file, produce bucketed JSON
reports, and treat the output as candidate generation for developer or
agent-reviewed cleanup.

That gives you a principled workflow without pretending that the dynamic parts of
this codebase are statically knowable.
