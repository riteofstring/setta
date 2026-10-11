import type {
  BrowserPipeline,
  BrowserPipelineMessage,
  BrowserPipelineSnapshot,
  BrowserPipelineWorker,
} from "./types";

export function createBrowserPipeline<
  Input,
  Output = Record<string, unknown>,
>(options: {
  createWorker: () => BrowserPipelineWorker;
  timeoutMs?: number;
}): BrowserPipeline<Input, Output> {
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("Pipeline timeout must be positive and finite.");
  let snapshot: BrowserPipelineSnapshot<Output> = {
    revision: 0,
    outputRevision: null,
    status: "idle",
    output: null,
    stages: {},
    error: null,
  };
  const listeners = new Set<() => void>();
  let worker: BrowserPipelineWorker | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: number | null = null;
  let queued: { revision: number; input: Input } | null = null;
  let disposed = false;
  const publish = (change: Partial<BrowserPipelineSnapshot<Output>>) => {
    snapshot = { ...snapshot, ...change };
    for (const listener of listeners) listener();
  };
  const stopWorker = () => {
    clearTimeout(timer);
    worker?.removeEventListener("message", receive);
    worker?.removeEventListener("error", fail);
    worker?.removeEventListener("messageerror", fail);
    worker?.terminate();
    worker = null;
    active = null;
  };
  const fail: EventListener = (event) => {
    const error =
      event instanceof ErrorEvent
        ? event.message
        : "Browser pipeline worker could not deliver a result.";
    stopWorker();
    if (queued) start();
    else publish({ status: "error", error });
  };
  const start = () => {
    if (!queued || active !== null || disposed) return;
    const request = queued;
    queued = null;
    try {
      if (!worker) {
        worker = options.createWorker();
        worker.addEventListener("message", receive);
        worker.addEventListener("error", fail);
        worker.addEventListener("messageerror", fail);
      }
      active = request.revision;
      timer = setTimeout(() => {
        stopWorker();
        if (queued) start();
        else
          publish({
            status: "error",
            error: `Browser pipeline exceeded ${timeoutMs} ms.`,
          });
      }, timeoutMs);
      worker.postMessage({ type: "run", ...request });
    } catch (error) {
      stopWorker();
      publish({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const receive: EventListener = (event) => {
    const message = (event as MessageEvent<BrowserPipelineMessage>).data;
    if (disposed || message.revision !== active) return;
    const current = message.revision === snapshot.revision;
    if (message.type === "stage") {
      if (current)
        publish({
          stages: { ...snapshot.stages, [message.id]: message.status },
        });
      return;
    }
    clearTimeout(timer);
    active = null;
    if (current && message.type === "result") {
      publish({
        status: "ready",
        output: message.output as Output,
        outputRevision: message.revision,
      });
    } else if (current && message.type === "error") {
      stopWorker();
      publish({ status: "error", error: message.error });
    }
    start();
  };
  return {
    run(input) {
      if (disposed) throw new Error("Browser pipeline is disposed.");
      const revision = snapshot.revision + 1;
      queued = { revision, input: structuredClone(input) };
      publish({ revision, status: "running", stages: {}, error: null });
      start();
      return revision;
    },
    cancel() {
      if (disposed) return;
      queued = null;
      stopWorker();
      publish({ status: "cancelled", stages: {}, error: null });
    },
    dispose() {
      disposed = true;
      queued = null;
      stopWorker();
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) throw new Error("Browser pipeline is disposed.");
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
