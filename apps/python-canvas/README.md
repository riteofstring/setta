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

The launcher installs frozen dependencies, builds the public workspace package
and Python Canvas production frontend, starts the loopback backend, waits only
for `GET /api/v2/project`, and then serves the built frontend with Vite preview
at `http://127.0.0.1:5173`. Use Ctrl-C to stop the launcher and its backend.

To reopen that same project later, use the same path without `--create`:

```sh
./scripts/run-python-canvas.sh \
  --project "$PWD/.local/python-canvas/project.json"
```

`--create` is exclusive: it creates an absent path and refuses to overwrite an
existing project. There is no implicit project, discovery flow, clone flow, or
save-as flow.

## Authoring model

Right-click a blank part of the canvas and choose **Python callable** to create
a callable. It appears at the requested canvas position with the default name
**New callable**; rename it through the editable section title, as on the main
canvas. Delete it with the section header's close control. Every callable gets
a section keyed by its canonical ID. Its compact Python expression field keeps
a separate draft until Enter commits it or Escape reverts it.

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
`--create`, writes a temporary fixture module, and waits for both
`GET /api/v2/project` and the Vite production preview origin. The browser then
creates multiple callables from the blank-pane menu, renames them from their
sections, commits them, exercises the public parameter toolbar, filter, item
actions, ItemNameEditor, app/provider expressions, and target document
boundaries, then deletes one
callable. It also creates a Param Dict and List of Objects, authors and nests
dictionary entries, checks entry-owned diagnostics, creates and moves list
children (including a nested list lifecycle), and verifies the persisted forest
and generated Python on restart. It restarts against the same path without
`--create` and compares the canonical sections, forest, diagnostics, parameter
metadata, and generated Python bytes.
It starts local services and a browser, so do not run it unless that suite is
explicitly authorized.

The walkthrough launches a raw headless Chrome executable only with
`--headless=new` and a disposable profile. Its launcher uses a mock keychain
and the basic password store, does not attach to an existing browser session,
and keeps keyboard shortcuts inside the page so the suite cannot take desktop
focus. On macOS it resolves, in order: a valid absolute
`PYTHON_CANVAS_CHROME_BINARY`; then the highest valid numeric revision under
`~/Library/Caches/ms-playwright/chromium_headless_shell-<revision>/chrome-headless-shell-mac-arm64/chrome-headless-shell`; otherwise it emits an actionable
error. GUI application executable paths are rejected. The suite prints the
resolved source and path before launch. The `--mute-audio` flag only mutes
renderer audio and cannot suppress AppKit system-alert sounds.
