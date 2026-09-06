# Setta Realtime

Realtime is a standalone local Setta app for authored React interfaces connected to ordinary
Python handlers. Python Canvas is not part of its runtime or authoring path.

## Commands

```console
setta realtime open --project-root ./my-app --create
setta realtime schema --pretty
setta realtime snapshot --project-root ./my-app --pretty
setta realtime apply --project-root ./my-app --file mutation.json --pretty
setta realtime reload --project-root ./my-app --pretty
setta realtime invoke --project-root ./my-app --handler increment --file input.json --pretty
```

## Drawing playground

The checked-in playground turns each settled drawing into a neon-glitch image using only Python's
standard library and browser-native SVG filters:

```console
setta realtime open --project-root ./apps/realtime/examples/neon-sketch
```

Choose **Draw**, make a mark, and the processed result appears beside the drawing. The example is
an ordinary Realtime project: its authored document is under `.local/realtime/project.json`, and
its editable handler is `app.py`. It requires no GPU, model download, or project dependency.

`open` owns one foreground session and stops when its Setta supervisor exits. When that session is
running, `snapshot`, `apply`, `reload`, and `invoke` address its live coordinator. Without a live
session, the same commands operate through a bounded local coordinator. `schema` is offline and is
the authoritative description of commands, operations, results, errors, and generated contracts.

A project uses ordinary files:

```text
my-app/
  .local/realtime/project.json
  app.py
  pyproject.toml
  uv.lock
```

Only `project.json` is Setta-authored state. Python metadata and locking remain standard project
choices. Realtime uses the nearest valid `.venv` at or above the project directory, otherwise the
Python interpreter that launched Setta.

## Project mutations

`apply` accepts one closed, revision-checked request. It never silently rebases a stale edit.

```json
{
  "projectId": "project-example",
  "expectedRevision": 3,
  "operations": [
    { "op": "setName", "name": "Counter" },
    { "op": "setViewport", "viewport": { "x": 0, "y": 0, "zoom": 1 } }
  ]
}
```

The operation union is `setName`, `setRuntime`, `upsertSection`, `deleteSection`, `setBinding`,
`deleteBinding`, `setConfiguration`, and `setViewport`. Unknown fields, unknown union members,
invalid section forests, broken binding references, and stale project revisions fail the complete
request without changing the project.

The initial section kinds are `input`, `output`, `button`, `status`, and `drawing`. A binding names
one exact event and handler, resolves `$event.FIELD` and `$sections.SECTION.FIELD` arguments from one
canonical snapshot, declares possible output targets, and selects `once`, `latest`, or `parallel`
scheduling with an explicit concurrency group and limit.

## Python handlers

The entrypoint exports an exact `handlers` dictionary. Optional `startup` and `shutdown` functions
run once per worker lifetime and may be async.

```python
count = 0


def increment(step=1):
    global count
    count += step
    return {"value": count}


def stream(limit=3):
    for value in range(limit):
        yield {"value": value}


handlers = {"increment": increment, "stream": stream}
```

A generator or async generator streams each yielded value. Awaitables are supported. Exceptions
become structured handler errors, while stdout and stderr become bounded runtime logs and never
share the protocol channel.

A content-reference argument remains a dictionary and gains a worker-private absolute `path`.
Handlers read the file at that path; the path never reaches the browser. Large output files are
streamed with an exact update envelope:

```python
def stylize(drawing, strength):
    output_path = create_image(drawing["path"], strength)
    yield {
        "outputs": {},
        "progress": 1,
        "message": "Complete",
        "artifacts": [
            {"name": "image", "mediaType": "image/png", "path": output_path}
        ],
    }
```

Artifact paths may be absolute or project-relative regular files. The worker copies them into its
invocation scope; Go validates and adopts them into the single content store. Browser messages
contain only the resulting content reference. Inputs, artifacts, JSON frames, queues, histories,
and logs all have explicit bounds.

Direct invocation input has the same portable value boundary:

```json
{
  "arguments": { "step": 2 },
  "content": []
}
```

## Browser behavior

The default presentation is Use mode. Use and Author render through the same `@setta/workspace`
host, shell, section registry, section chrome, and upstream XYFlow canvas. Use disables structural
and layout editing and omits the Inspector; it is not a separate frontend or project model. Project
snapshots arrive as complete SSE values. Runtime snapshots, events, cancellations, invocation
status, updates, and logs use one WebSocket. Reconnection replaces local state from current
complete snapshots.

Fabric.js owns retained drawing objects, free drawing, erasing, selection, transforms,
serialization, and raster export. Pointer movement stays local. Realtime persists the vector scene
and uploads one raster input only after a coherent settled gesture.

Only the newest applicable invocation may update a binding target. `latest` retains one pending
event, `once` rejects overlap, and `parallel` remains within declared binding and group bounds. A
Cancel action removes queued work or requests cooperative worker cancellation. A timeout or crash
replaces the whole worker process because arbitrary synchronous Python cannot be safely interrupted.

## Local security and lifecycle

The host binds IPv4 loopback, validates the exact listener authority and browser origin, preflights
all production assets, and keeps every API route outside SPA fallback. User Python intentionally
runs with the current user's permissions; process ownership provides bounded lifetime and
descendant cleanup, not a security sandbox.

The private language-neutral worker contract is JSON-RPC 2.0 with strict LSP `Content-Length`
framing. A later language adapter must implement the same `initialize`, `runtime/invoke`,
`runtime/update`, `$/cancelRequest`, and `shutdown` lifecycle and pass the existing non-Python
conformance fixture. Registration is compile-time at `openLocalApplication`: the runtime-kind
selection constructs an implementation of the coordinator's `runtime.Worker` interface and its
optional artifact and log sources. Unsupported kinds remain errors. The new adapter may add its own
launcher and containment implementation, but project bindings, scheduling, browser transport, and
frontend code do not change.
