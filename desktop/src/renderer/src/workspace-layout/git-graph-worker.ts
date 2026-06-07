import {
  buildGitGraphBatch,
  type GitGraphLayoutRequest,
  type GitGraphWorkerMessage,
} from "./git-graph-layout";

type WorkerCommand =
  | { request: GitGraphLayoutRequest; requestId: string; type: "layout" }
  | { requestId: string; type: "cancel" };

const activeRequests = new Set<string>();
const workerScope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerCommand>) => void): void;
  postMessage(message: GitGraphWorkerMessage): void;
};

workerScope.addEventListener("message", (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;
  if (command.type === "cancel") {
    activeRequests.delete(command.requestId);
    return;
  }
  activeRequests.add(command.requestId);
  runLayout(command.requestId, command.request, 0);
});

function runLayout(requestId: string, request: GitGraphLayoutRequest, startIndex: number): void {
  if (!activeRequests.has(requestId)) {
    return;
  }

  const batch = buildGitGraphBatch(request, startIndex);
  workerScope.postMessage({ requestId, type: "batch", value: batch });

  if (batch.done) {
    activeRequests.delete(requestId);
    workerScope.postMessage({
      requestId,
      type: "complete",
      value: { totalNodeCount: batch.totalNodeCount },
    });
    return;
  }

  setTimeout(() => runLayout(requestId, request, batch.processedNodeCount), 0);
}
