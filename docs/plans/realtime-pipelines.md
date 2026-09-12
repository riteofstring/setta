# Realtime pipeline support

Status: native multi-stage pipelines are not supported

Direction: represent each scheduled callback as an app-owned handler section while retaining the
optional singular code section as the shared runtime entrypoint editor.

## Current behavior

Realtime supports fan-out from one interaction to multiple independently scheduled handlers:

```text
Drawing
 ├─ handler A → Output A
 └─ handler B → Output B
```

It does not support feeding those output sections into another callback:

```text
Output A ─┐
          ├─ handler C → Final output
Output B ─┘
```

Output and status sections are sinks rather than binding trigger sources. Publishing a runtime
output updates its displayed value but does not emit another event. Runtime outputs also do not
become authored `$sections` data. There is no fan-in barrier or run lineage to ensure two branch
results came from the same drawing snapshot.

## Current playground model

The Neon Sketch playground has one section whose ID is `callback`, but its kind is `code`. It
projects the complete `app.py` entrypoint, which registers both `neon_glitch` and
`pillow_risograph`. The two project bindings independently select those handlers, configure their
scheduling, and route their `image` outputs.

The code section therefore represents a source module, not an individual callback invocation. It
remains the sole in-app source editor and has no binding event or output semantics.

## Planned authoring model

Add an app-owned `handler` section for each independently scheduled binding. A handler section is
a visual projection of one binding rather than another source authority. Its closed section data
references the binding ID; the binding continues to own the handler name, arguments, trigger,
scheduling, materialization, and declared outputs.

```json
{
  "id": "neon-handler",
  "kind": "handler",
  "data": {
    "bindingId": "stylize-drawing"
  }
}
```

The project validator must enforce a one-to-one relationship between handler sections and
bindings. Creating or deleting a handler node, or reconnecting one of its ports, must update the
section, binding, and incident pipeline edges in one revision-checked project mutation.

Each handler node presents:

- the selected handler and whether it exists in the active entrypoint;
- named argument and output ports;
- queued, waiting, running, completed, and failed runtime state; and
- scheduling and materialization controls in the Inspector.

The existing Workspace controlled graph layer supplies ports, edges, connection gestures,
reconnection, selection, deletion, and status presentation. Realtime remains the graph authority
and projects binding state into that layer; Workspace graph types do not enter the project
document.

The playground pipeline would read as:

```text
Drawing ─┬→ [neon_glitch] ──────→ Neon result
         └→ [pillow_risograph] ──→ Riso result

[neon_glitch].image ─────┐
                           ├→ [combine] → Final result
[pillow_risograph].image ─┘

Code: app.py
```

The code section remains optional. Projects edited externally can use handler nodes without
showing the shared entrypoint editor.

## Pipeline contract

Make binding triggers a closed union between an authored section event and an all-input runtime
join. Runtime input references are structured binding-output references rather than section values
or magic strings:

```json
{
  "id": "combine-results",
  "trigger": {
    "kind": "join",
    "mode": "all",
    "inputs": {
      "neon": { "bindingId": "stylize-drawing", "output": "image" },
      "riso": { "bindingId": "render-risograph", "output": "image" }
    }
  },
  "handler": "combine",
  "arguments": {},
  "scheduling": {
    "mode": "latest",
    "debounceMilliseconds": 0,
    "concurrencyGroup": "combining",
    "concurrencyLimit": 1
  },
  "outputs": {
    "image": {
      "target": { "sectionId": "final-result", "field": "contentRef" }
    }
  }
}
```

Logical output ports are separate from optional display targets so a pipeline can have an
intermediate result without requiring an output section. Event-triggered bindings use the other
trigger variant with `kind`, `sectionId`, and `event`. Existing `$event` and authored `$sections`
arguments remain available throughout a run from its frozen root event and project snapshot.

This changes the closed project shape and should use the next project contract version rather than
silently reinterpreting version 1.

## Runtime semantics

Go remains authoritative for graph validation, lineage, scheduling, publication, and content
ownership. On each accepted root event it creates one run ID, freezes the event payload and project
revision, and assigns that lineage to every reachable handler invocation.

A join becomes runnable only after every referenced producer in the same run completes
successfully and supplies its declared output. Streamed updates may continue to update display
targets, but they do not release downstream handlers. Completion uses the invocation's accumulated
outputs so generator handlers can feed a join even when their final return value is empty.

The initial graph contract permits one root event identity per connected pipeline. Validation must
reject missing bindings or output ports, ambiguous root ancestry, orphan joins, self-edges, and
direct or indirect cycles.

Scheduling policies apply across waiting, queued, and running pipeline nodes:

- `latest` permits one running invocation and retains only the newest waiting or queued lineage;
- `once` rejects another lineage while any invocation of the binding is in flight; and
- `parallel` remains bounded by the binding and concurrency-group limits.

Superseding, cancelling, or failing an upstream invocation invalidates its unstarted descendants.
Queued descendants are removed and active descendants receive cooperative cancellation. Every
late update is checked against both invocation identity and valid run lineage before publication.

Scalar intermediate outputs live with the run. Content references remain retained until all
consumers receive invocation-scoped clones, then are released when the run becomes terminal. A
retained materialization may satisfy a startup node only after its fingerprint matches and it is
adopted into the new run lineage; displayed retained values from unrelated runs never satisfy a
join.

## Initial delivery scope

The first vertical slice includes:

1. the versioned handler-section, binding-trigger, output-port, and runtime-lineage contracts;
2. deterministic DAG compilation and validation;
3. lineage-aware scheduling, all-success joins, invalidation, cancellation, and content cleanup;
4. Realtime projection into the Workspace graph layer and atomic graph-edit mutations; and
5. a playground `combine` handler and final output demonstrating fan-out followed by fan-in.

Acceptance coverage must prove that branch completion order does not affect a join, interleaved
runs never cross-pair outputs, streams do not release a join before completion, failures and
supersession cannot leave descendants waiting indefinitely, cycles are rejected, reconnect
recovers current lineage state, and intermediate content is reclaimed.

The first increment does not include joins across independent root events, partial-update
propagation, `any` or race joins, loops, or copying runtime output into authored section data.

## Current workaround

Until native support exists, use one drawing-triggered orchestration handler. It can run both
branches concurrently, stream their intermediate values to separate output sections, combine the
results, and then publish the final value. This provides the behavior, but the pipeline remains
Python code rather than a graph of independently connected handlers.
