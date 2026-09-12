# Realtime pipeline support

Status: native multi-stage pipelines are not supported

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

## Current workaround

Use one drawing-triggered orchestration handler. It can run both branches concurrently, stream
their intermediate values to separate output sections, combine the results, and then publish the
final value. This provides the behavior, but the pipeline remains Python code rather than a
ComfyUI-style graph of independently connected callbacks.

## Native support required

Native pipelines would require runtime-output edges and references, per-event execution lineage,
fan-in and join semantics, downstream invalidation and cancellation, scheduling rules, and DAG
validation with cycle rejection.
