# Python Canvas

Python Canvas is a private V1 vertical slice for authoring one Python callable
through `@setta/workspace`. Go owns the in-memory project, generated Python,
source ranges, and Basedpyright lifecycle; the React app projects canonical Go
responses through the workspace public API. There is one **Callable** section
named **Square Root** and one read-only **Generated Python** section.

## Run locally

Install the locked workspace dependencies from the repository root:

```sh
pnpm install --frozen-lockfile
```

Start the loopback-only Go service from one terminal:

```sh
go -C apps/python-canvas/backend run ./cmd/python-canvas
```

It listens on `127.0.0.1:8080`, materializes its temporary generated file, and
starts the app's pinned `basedpyright` dependency. No globally installed
language server is used.

Start Vite from a second terminal:

```sh
pnpm --filter @setta/python-canvas dev
```

Open the URL Vite prints (normally `http://127.0.0.1:5173`). Its `/api` proxy
targets `http://127.0.0.1:8080` by default. Use Ctrl-C in both terminals to
shut down the service, language server, temporary generated file, and Vite.

To exercise the checked-in walkthrough against the production frontend, real
Go service, and pinned language server, run:

```sh
pnpm --filter @setta/python-canvas run browser:test
```

The walkthrough commits `math.sqrt`, enters `missing_value` for `x`, then
replaces it with `3`. Each accepted mutation automatically updates the
read-only generated Python; the undefined-name diagnostic is mapped to `x` by
the generated source range and clears after the final expression.

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
  completion menus, hover or documentation popovers, prefix/suffix completion,
  or general semantic-editor services.
- Arbitrary callable expressions, additional parameter-control kinds, a
  callable/plugin catalog, alternate language servers, or fallback servers.
- A public package, final naming, licensing, desktop packaging, deployment, or
  release artifacts.
- The deferred `@setta/workspace/core` transaction engine, the broader workspace
  generalization roadmap, wholesale copying of `setta-main`, unrelated parity
  auditing, or speculative edge-case work.
- Legacy readers, migrations, aliases, transitional endpoints, or other
  backward-compatibility surfaces.
