# Browser pipelines

`@riteofstring/setta/browser` runs application-owned computations in a Web Worker. It works on
static hosting without a server, React, or the workspace UI at runtime.

## A worker with dependent stages

Create `compute.worker.ts`:

```ts
import { exposeBrowserPipeline } from "@riteofstring/setta/browser";

exposeBrowserPipeline<number>(self, [
  { id: "double", run: ({ input }) => input * 2 },
  {
    id: "label",
    dependencies: ["double"],
    run: ({ dependencies }) => `Result: ${dependencies.double}`,
  },
]);
```

Then create one pipeline for the consuming component or application's lifetime:

```ts
import { createBrowserPipeline } from "@riteofstring/setta/browser";

const pipeline = createBrowserPipeline<
  number,
  { double: number; label: string }
>({
  createWorker: () =>
    new Worker(new URL("./compute.worker.ts", import.meta.url), {
      type: "module",
    }),
});
const unsubscribe = pipeline.subscribe(() => {
  const { status, output, error } = pipeline.getSnapshot();
  if (status === "ready") console.log(output?.label);
  if (status === "error") console.error(error);
});
pipeline.run(21);
```

Vite and other worker-aware ESM bundlers package the worker as a separate static asset. On teardown,
call `unsubscribe()` and `pipeline.dispose()`. In React, subscribe with
`useSyncExternalStore(pipeline.subscribe, pipeline.getSnapshot)` and call `run` from an effect when
inputs change. Create/dispose the worker owner with your application's actual lifetime, outside
render-time side effects.

## Execution and recovery

- Stages have unique nonempty IDs. Dependencies must exist and form an acyclic graph. Validation
  runs before any handler; every stage executes once per run and shared ancestors are reused.
- Independent stages can await work concurrently inside one worker. CPU-heavy synchronous handlers
  share that worker thread; this is not a worker pool.
- Each handler receives the detached `input`, results from its declared `dependencies`, and an
  `AbortSignal`. Inputs and results must support structured clone. Dependency values are `unknown`;
  the application owns their types. The client output type describes your stage-result object.
- `run(input)` returns a monotonically increasing revision. It keeps one active run and replaces
  any waiting input with the newest one. Results from an older input never replace the latest
  requested output. A successful older output remains available during processing or failure;
  compare `revision` with `outputRevision` and display `status` accordingly.
- `cancel()` terminates the worker and discards queued work, including non-cooperative synchronous
  work. A later `run()` starts a fresh worker. `dispose()` also removes subscriptions permanently.
- The default per-run deadline is 10 seconds, configurable with positive finite `timeoutMs`.
  A timeout or worker crash terminates that worker. A queued newest input or a later run uses a
  fresh instance. Handler errors retain the last successful output and are exposed in `error`.
- `stages` reports `running`, `ready`, or `error` for the current revision. A failed stage prevents
  its dependents from running. Handlers should honor cancellation when awaiting external work.
- A handler can call `reportProgress({ fraction: 0.5, message: "Downloaded 240 MB" })`.
  Both fields are optional; a supplied fraction must be finite and between zero and one.
  `snapshot.progress[stageId]` contains the latest report for the current revision. Progress resets
  on a new request or cancellation. Late reports after the handler settles are ignored. Progress
  does not extend the run deadline or replace the last successful output.

`executeBrowserPipeline(stages, input, signal, onStage?, onProgress?)` also executes the graph directly, useful
for tests or an existing worker host. `validateBrowserPipeline(stages)` checks the graph alone.
`exposeBrowserPipeline(scope, stages)` returns a disposer for hosts that own a longer-lived worker.
The client factory must return a dedicated worker that the pipeline is allowed to terminate.

This library runs trusted application code. A Web Worker is not a sandbox for untrusted programs.
It does not provide Python execution, persistent projects, networking, or application-specific
effects. Those remain application decisions.

## GPU scenes and other expensive computations

Send structured-cloneable source records, measurements, and packed arrays through the pipeline.
WebGL renderers and their GPU resources belong to the rendering view. Keep frame-by-frame rendering on the renderer's own loop. Sliders update shader uniforms without
requesting another pipeline run; loading a different capture requests new worker processing.
Use `outputRevision` and `status` to identify the last successful scene while newer work is pending.

The same boundary supports browser ML: keep model sessions private to the worker and return data,
not sessions or GPU devices. A model-loading stage can initialize a private session and return small
metadata to dependent stages. Set a suitable finite `timeoutMs` for downloads or expensive work.
Cancellation terminates the worker, including private sessions; restarting reconstructs them.

File formats, ML models, download/cache policy, and rendering belong to the consuming application.
They add no ML or rendering dependencies to the Setta package.
