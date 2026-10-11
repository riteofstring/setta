import { executeBrowserPipeline, validateBrowserPipeline } from "./execute";
import type { BrowserPipelineStage, BrowserPipelineWorkerScope } from "./types";

export function exposeBrowserPipeline<Input>(
  scope: BrowserPipelineWorkerScope,
  stages: readonly BrowserPipelineStage<Input>[],
): () => void {
  validateBrowserPipeline(stages);
  let controller: AbortController | null = null;
  let disposed = false;
  const receive = (event: MessageEvent) => {
    if (disposed || event.data?.type !== "run") return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    const { revision, input } = event.data;
    const send = (message: unknown) => {
      if (!disposed && controller === current && !current.signal.aborted)
        scope.postMessage(message);
    };
    void executeBrowserPipeline(
      stages,
      input as Input,
      current.signal,
      (id, status) => {
        send({ type: "stage", revision, id, status });
      },
    )
      .then(
        (output) => send({ type: "result", revision, output }),
        (error: unknown) =>
          send({
            type: "error",
            revision,
            error: error instanceof Error ? error.message : String(error),
          }),
      )
      .catch((error: unknown) => {
        send({
          type: "error",
          revision,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };
  scope.addEventListener("message", receive);
  return () => {
    disposed = true;
    controller?.abort();
    scope.removeEventListener("message", receive);
  };
}
