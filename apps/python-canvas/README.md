# Python Canvas

Python Canvas is a private V1 vertical slice for authoring one Python callable
through `@setta/workspace`. Go owns the in-memory project, generated Python,
source ranges, and Basedpyright lifecycle; the React app projects canonical Go
responses through the workspace public API. There is one **Callable** section
named **Square Root** and one read-only **Generated Python** section.

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
leading item-area content, so it precedes the Args toolbar and the
signature-derived parameter rows. This slice has no parameter-structure
mutations, so that toolbar is declared `filter-only`: it keeps the Args label
and the filter, and exposes no Add, Remove, or Delete action. Ordinary pending
state reads as a compact adornment on the editor plus a live region; only
genuine completion, mutation, and provider failures claim a visible block.

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
replaces it with `3`. Each accepted mutation automatically updates the read-only
generated Python; the undefined-name diagnostic is mapped to `x` by the
generated source range and clears after the final expression.

## Deliberately deferred

This V1 slice intentionally does not provide the following capabilities. This
is a no-support list, not a compatibility promise or future roadmap.

- MCP, a user-facing CLI, or headless command parity; the service binary is
  delivery wiring only.
- A Generate Python command, toolbar button, or standalone generation endpoint.
- Source-root configuration, source discovery, Watch Code, filesystem watching,
  or callable reconciliation after source changes.
- Python execution, interpreter selection, terminals, PTYs, run history,
  cancellation, or arbitrary statement insertion.
- Persistence, save/load, databases, authentication, collaboration,
  WebSockets, server-sent events, polling, CORS, or authentication placeholders.
- Ports, edges, connection gestures, Dict or other value sections, or multiple
  callable sections.
- Variants, section policies, code-object value policies, metadata generation,
  rename refactoring, or generated-output export.
- Editable prefix or suffix regions, mixed editable/read-only editor regions,
  hover or documentation popovers, prefix/suffix completion, parameter
  completion, or general semantic-editor services.
- Arbitrary callable expressions, additional parameter-control kinds, a
  callable/plugin catalog, alternate language servers, or fallback servers.
- A public package, final naming, licensing, desktop packaging, deployment, or
  release artifacts.
- The deferred `@setta/workspace/core` transaction engine, the broader workspace
  generalization roadmap, wholesale copying of `setta-main`, unrelated parity
  auditing, or speculative edge-case work.
- Legacy readers, migrations, aliases, transitional endpoints, or other
  backward-compatibility surfaces.
