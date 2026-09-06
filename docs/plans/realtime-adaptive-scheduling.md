# Realtime adaptive scheduling implementation plan

Status: in progress

## Outcome

Realtime interactions should produce useful output throughout a continuous gesture without creating
an unbounded backlog or repeatedly preparing work that cannot run. The same policy must feel quick
for the Neon example and remain stable when a handler takes 500 milliseconds or longer.

The implementation uses the existing explicit scheduling document as the authored API. This is the
recommended interactive policy:

```json
{
  "mode": "latest",
  "debounceMilliseconds": 0,
  "concurrencyGroup": "image-processing",
  "concurrencyLimit": 1
}
```

With this policy, the first input starts immediately. While it runs, the browser retains only its
newest unsent drawing state and the host retains at most one newest submitted invocation. Completion
releases capacity for the newest state. A cheap handler therefore runs frequently, while a slow
handler naturally runs at its sustainable throughput without an estimated debounce interval.

## Current failure

The Neon drawing producer offers a preview every 90 milliseconds, while its checked-in binding uses
a 120 millisecond trailing debounce. Continuous pointer movement resets the debounce before work can
start.

Once work does start, both the Go coordinator and React runtime state equate newest submitted input
with newest publishable output. Submitting invocation N+1 marks running invocation N superseded and
causes its updates and final result to be discarded. A continuously changing input can consequently
prevent a 500 millisecond handler from ever displaying anything.

The browser also treats worker readiness as capacity. It continues rasterizing and uploading while
the matching binding is occupied, even though only the newest pending frame can be useful.

## Scheduling contract

The authored ProjectV1 fields keep their current closed shape:

- `debounceMilliseconds` controls deliberate trailing admission delay;
- `mode` selects overlap behavior;
- `concurrencyGroup` identifies a shared scarce resource; and
- `concurrencyLimit` bounds that shared resource.

`latest` gains these exact runtime invariants:

1. With zero debounce, idle work starts on the leading edge.
2. One binding has at most one active invocation, regardless of unused group capacity.
3. It retains at most one pending invocation, whether that pending work is queued or debounced.
4. A newer input replaces only pending work. Running work is not cancelled or marked superseded.
5. Completion, failure, or cancellation releases the binding slot and dispatches the retained input.
6. The shared group remains bounded and uses its lowest declared member limit across bindings.

Callers that need concurrent executions of one binding continue to select `parallel`. `once`
continues to reject overlap. Automatic cancellation is not part of `latest`: arbitrary synchronous
Python and native model code may not cooperate, and repeatedly restarting slow work can recreate
output starvation.

The scheduler reports the exact invocation it replaced. The coordinator uses that fact to mark only
dropped pending work as `superseded`; it no longer guesses from submission sequence or races a task
that has already started.

## Publication contract

Newest submitted status and newest published output are separate watermarks per binding.

- Invocation status follows the highest submitted sequence.
- An active invocation may stream or complete while a newer invocation is pending.
- An output is published when its sequence is not older than the binding's published-output
  watermark.
- Once sequence N+1 publishes output, a late output from N cannot replace it.
- Progress or message-only updates do not advance the output watermark.
- Runtime snapshots carry the published identities so reconnect and slow-subscriber snapshot
  replacement preserve the same decision.

The browser mirrors this split. Its status view continues to follow the newest invocation, while
output application compares against the host-supplied published identity. A queued status can no
longer hide the useful completion immediately ahead of it.

Existing generator and async-generator updates remain the progressive-output API. They already carry
progress, message, JSON outputs, and artifacts; normal handler completion remains the definitive
final boundary. This change does not add a second preview/final wire format.

## Drawing admission

The drawing producer recognizes a completion-paced event when every matching binding uses `latest`
with zero debounce. The browser then treats matching invocation status as one local capacity credit:

1. The first pointer-derived preview is eligible immediately.
2. A successful event send consumes the local credit before another capture can begin.
3. While occupied, pointer movement records only one dirty preview marker. It performs no raster
   capture or upload.
4. A terminal matching invocation status replenishes the credit and drains the newest dirty state.
5. A settled gesture clears obsolete preview work, persists its vector scene once, and retains a
   final raster until it can be sent.
6. Final work takes priority over lossy previews after capacity returns.

The authoritative Go scheduler remains the correctness boundary. Status-driven browser admission is
an efficiency and latency mechanism for the current single-owner local product; server-issued
reservation tokens are deferred until multiple competing browser producers become an accepted
scenario.

The fixed preview timer remains only for non-completion-paced policies. Completion-paced work needs
no EWMA: the observed completion itself is the feedback signal. A future ergonomic SDK helper may
emit the existing policy object under a name such as `interactive_latest`, but the project document
continues to store explicit fields rather than an alias.

## Ideas borrowed and deferred

The implementation borrows Gradio's shared resource queues, always-latest coalescing, and streamed
handler outputs. It borrows Streamlit's process-lifetime resource boundary: project modules and
startup hooks already load expensive models once per worker lifetime. It borrows ComfyUI's separation
of execution progress from output publication and its principle of retaining useful prior results.

The following are not part of this plan:

- graph-level dirty propagation, lazy inputs, or deterministic result caching;
- cross-session GPU micro-batching or hosted fairness;
- automatic handler cancellation;
- a new Python decorator or a second project-authoring SDK;
- typed preview and final messages; and
- EWMA-based timing guesses.

Those features require independent contracts for purity, handler and model revision identity,
artifact retention, batching support, or multi-client admission. Unique drawing frames would rarely
benefit from whole-result caching, while worker startup already provides the important model-warming
behavior.

## Implementation batches and commits

### Batch 1: plan

Commit this plan before governed implementation. Retrieve the exact backend and frontend design
context selected for the source changes.

### Batch 2: scheduler and coordinator

1. Enforce one active and one pending slot for `latest`, including debounced work.
2. Bound every shared group queue and preserve FIFO position when latest work is replaced.
3. Return exact replacement identity from submission and keep cleanup exactly once.
4. Replace submission-based suppression with a monotonic published-output watermark.
5. Include published identities in complete runtime snapshots and regenerate contracts.
6. Cover leading dispatch, replacement, cancellation, streaming, completion order, and snapshot
   recovery with focused Go tests.

### Batch 3: browser admission and publication

1. Separate latest invocation status from published output state.
2. Accept host-authorized output N while status N+1 is queued, then reject N after N+1 publishes.
3. Make the drawing queue consume and replenish completion-driven capacity locally.
4. Retain one dirty preview without capture or upload while busy.
5. Prioritize and retry the final settled snapshot.
6. Cover the queue and runtime reducer behavior with focused component tests.

### Batch 4: example and durable guidance

1. Set the Neon binding to zero debounce without committing the user's drawing scene or layout.
2. Update public Realtime behavior and mapped backend/frontend rationale.
3. Exercise sustained drawing against both a quick and deliberately delayed handler in browser
   verification.
4. Mark this plan implemented after required checks and the final gate succeed.

## Completion criteria

- Continuous Neon drawing starts producing results before pointer release and continues doing so.
- A 500 millisecond latest handler publishes completed intermediate frames instead of starving.
- One latest binding never exceeds one active plus one newest pending invocation.
- A debounced latest binding cannot hold a third hidden pending task.
- A browser does not capture or upload pointer-rate previews while its completion credit is consumed.
- The final settled drawing remains pending until it is successfully sent after capacity returns.
- Output values never regress after a newer sequence has published.
- Reconnect and subscriber overflow snapshots preserve published-output watermarks.
- Existing progress, artifact, cancellation, shared-group, and worker-lifecycle behavior remains
  observable and bounded.
- The Neon policy change is committed independently of the user's runtime drawing state.
