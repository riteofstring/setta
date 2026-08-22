# Python Canvas

Python Canvas is a durable local application for authoring one named Python
project. The project has zero or more callables, each with its own independent
expression draft and ordered parameter list. Go owns the canonical project,
rendered Python, diagnostics, persistence, and Basedpyright lifecycle; the
React application renders the V2 snapshot using only public
`@setta/workspace` APIs.

The only project endpoint is `GET /api/v2/project`. Every update is bound to
the project ID and current revision, so a stale update receives a typed conflict
instead of silently replacing newer authored state.

## Start a project

Choose the exact path that will hold the project. To create an absent project:

```sh
mkdir -p .local/python-canvas
./scripts/run-python-canvas.sh \
  --project "$PWD/.local/python-canvas/project.json" \
  --create
```

The launcher installs frozen dependencies, builds the public workspace package,
starts the loopback backend, waits only for `GET /api/v2/project`, and then
starts Vite. Open the local URL Vite prints. Use Ctrl-C to stop the launcher and
its backend.

To reopen that same project later, use the same path without `--create`:

```sh
./scripts/run-python-canvas.sh \
  --project "$PWD/.local/python-canvas/project.json"
```

`--create` is exclusive: it creates an absent path and refuses to overwrite an
existing project. There is no implicit project, discovery flow, clone flow, or
save-as flow.

## Authoring model

Use the labelled **Project name** control to rename the one project. Use **New
callable name** and **Add callable** to create a callable; every callable gets a
section keyed by its canonical ID. Its expression field keeps a separate draft
until it is committed or reverted.

Each callable section uses the workspace's public authoring-and-filter item
toolbar. It supports Add, Remove Last, Delete Selected, drag reorder, filtering,
and item actions for the complete ordered parameter proposal. App-authored rows
use a labelled name editor. Provider-derived rows retain their immutable
provider metadata and can still be reordered, deleted, or given an authored
expression. Validation, pending work, provider availability, conflicts, and
other failures are announced in the interface.

**Generated Python** is one combined document. The Python before and after the
generated body is editable as a pair; the one body range from the canonical V2
snapshot is protected. A mutation that touches that body is rejected by the
workspace before it can reach the backend. Python completion is available only
in the editable outer regions and sends the complete document plus the exact
protected UTF-16 range.

## Browser walkthrough

`pnpm --filter @setta/python-canvas run browser:test` is the checked-in browser
walkthrough for a separately authorized standard verification run. It creates a
temporary absent project through the launcher with explicit `--project` and
`--create`, observes the V2 readiness endpoint, renames the project through the
labelled browser control, restarts against the same path without `--create`, and
verifies the persisted V2 snapshot. It starts local services and a browser, so
do not run it unless that suite is explicitly authorized.
