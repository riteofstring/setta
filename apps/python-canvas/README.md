# Python Canvas

Python Canvas is a private V1 vertical slice for authoring one Python callable
through `@setta/workspace`. Go owns the in-memory project, generated Python,
source ranges, and Basedpyright lifecycle; the React app projects canonical Go
responses through the workspace public API. There is one **Callable** section
named **Square Root** and one **Generated Python** section.

The service commits the shipped Square Root example through its own store before
it accepts a request, so the first response — and therefore the first render —
already holds the committed `math.sqrt`, the `x` parameter Basedpyright derived
from its signature, and the generated call. The callable editor shows that
committed value rather than a placeholder standing in for one.

Editing it supports narrow callable-name completion: replace the value with
`math.fl`, and `floor` is offered. `Tab` accepts an offer into the local draft
without committing it, one unmodified `Enter` commits the draft the field is
showing even while the completion popup is open, and `Escape` — after the popup
has taken its own first `Escape` — abandons the draft for the committed value.

Inside the Callable section, the compact callable editor is the workspace's
leading item-area content, so it precedes the Args toolbar and the parameter
rows. That toolbar is the workspace's ordinary `authoring-and-filter` one: Add
parameter, Remove last parameter, and Delete selected parameters all author real
arguments, and the filter advertises the workspace binding that focuses it
(`Mod + K` by default, shown as `⌘ + K` on macOS). Ordinary pending state reads
through the app-level live status without decorating the callable field; only
genuine completion, mutation, and provider failures claim a visible block.

Every parameter change — a value edit, a rename, an Add, a Remove Last, a
Delete Selected, or a drag reorder — reaches Go as one complete ordered
parameter list bound to the revision the app last saw. The store validates the
whole candidate, keeps the metadata it owns for a retained record, creates a new
record's defaults, renders the module, and publishes one revision; a rejected
proposal leaves the project untouched and the app puts the canonical list back.
A parameter derived from the resolved signature keeps that signature's name, so
only an app-authored row offers the rename editor; an authored row may sit blank
while someone writes it, and it joins the generated call once it has both a
valid name and a value.

**Generated Python** is one document, not a generated pane beside an authored
one: the Python before the generated body and the Python after it are ordinary
editable text, and between them one declared region holds the module Go
rendered. That region stays selectable and copyable while refusing every edit
that touches it — typing, paste, cut, deletion, and replacement — and the caret
and cursor motion step over it rather than into it. Edits to the Python around
it reach Go as one complete revision-bound Python target, and canonical
responses keep Go's generated body between the authored prefix and suffix.
Undo and redo take authored edits back and put them back; a regeneration Go
sends is nobody's edit, so it never joins that history.

## Run locally

From the repository root, run the local-development wrapper:

```sh
./scripts/run-python-canvas.sh
```

The wrapper installs the frozen dependencies, builds `@setta/workspace`, starts
the loopback-only Go service and its pinned `basedpyright`, waits for the
backend to become ready, and then starts Vite. Open the URL Vite prints
(normally `http://127.0.0.1:5173`). One Ctrl-C shuts down the service, language
server, temporary generated file, and Vite.

To exercise the checked-in walkthrough against the production frontend, real
Go service, and pinned language server, run:

```sh
pnpm --filter @setta/python-canvas run browser:test
```

The walkthrough asserts the raw first render against the canonical response
before it changes anything. Still in that untouched scene, it pinch-zooms the
canvas onto the Square Root card with the pointer resting on it, waits for the
gesture to settle, and requires the card to keep no compositor layer of its own
and its completion popup to open outside the section box that used to crop it;
it then reloads, so everything after it measures the shipped 1x composition. It
then drives the callable keys through a second
real callable, `math.floor`, because a key sequence that begins and ends on the
committed `math.sqrt` cannot show whether anything was committed: `Escape`
abandons a draft without touching the project, `Tab` accepts `floor` without
committing it, one `Enter` commits `math.floor`, and one more commits
`math.sqrt` back over an open popup. It then enters `missing_value` for `x` and
replaces it with `3`. Each accepted mutation automatically updates the generated
body; the undefined-name diagnostic is mapped to `x` by the generated source
range and clears after the final expression. It then presses the resolved filter
chord to focus the Args filter, and authors arguments through the toolbar: Add
creates a blank record, naming it `scale` and valuing it `2` puts its keyword
argument in the generated call, Remove Last takes it away, and two rows selected
with the canvas's held selection gesture leave together in one new revision.
Last, because it reloads the page, it authors Python around the generated body:
every edit that touches the protected range leaves both the document and the
project alone, an added import and an added statement each survive the canonical
response and the reload, and undo and redo of those authored edits keep the
block around exactly the generated body.

## Deliberately deferred

This V1 slice intentionally does not provide the following capabilities. This
is a no-support list, not a compatibility promise or future roadmap.

- MCP, a user-facing CLI, or headless command parity; the service binary is
  delivery wiring only.
- A Generate Python command, toolbar button, or standalone generation endpoint.
- Source-root configuration, source discovery, Watch Code, filesystem watching,
  or callable reconciliation after source changes.
- Python execution, interpreter selection, terminals, PTYs, run history, or
  cancellation.
- Persistence, save/load, databases, authentication, collaboration,
  WebSockets, server-sent events, polling, CORS, or authentication placeholders.
- Ports, edges, connection gestures, Dict or other value sections, or multiple
  callable sections.
- Variants, section policies, code-object value policies, metadata generation,
  rename refactoring, or generated-output export.
- More than one generated region per document, hover or documentation popovers,
  prefix/suffix completion, parameter completion, or general semantic-editor
  services.
- Arbitrary callable expressions, additional parameter-control kinds, a
  callable/plugin catalog, alternate language servers, or fallback servers.
- A public package, final naming, licensing, desktop packaging, deployment, or
  release artifacts.
- The deferred `@setta/workspace/core` transaction engine, the broader workspace
  generalization roadmap, wholesale copying of `setta-main`, unrelated parity
  auditing, or speculative edge-case work.
- Legacy readers, migrations, aliases, transitional endpoints, or other
  backward-compatibility surfaces.
