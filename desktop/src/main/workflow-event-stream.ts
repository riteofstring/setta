import { backendEndpoints, decodeWorkflowEvent, type WorkflowEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "./backend-event-stream";

export interface WorkflowEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface WorkflowEventStreamOptions {
  baseURL: string;
  fetchImpl?: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: WorkflowEvent) => void;
}

const defaultReconnectDelayMs = 500;

export function startWorkflowEventStream(options: WorkflowEventStreamOptions): WorkflowEventStream {
  const abort = new AbortController();
  const done = runWorkflowEventStreamLoop({
    baseURL: options.baseURL,
    fetchImpl: options.fetchImpl ?? fetch,
    reconnectDelayMs: options.reconnectDelayMs ?? defaultReconnectDelayMs,
    sendEvent: options.sendEvent,
    signal: abort.signal,
  });
  return {
    done,
    stop: async () => {
      abort.abort();
      await done;
    },
  };
}

async function runWorkflowEventStreamLoop(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  reconnectDelayMs: number;
  sendEvent: (event: WorkflowEvent) => void;
  signal: AbortSignal;
}) {
  while (!options.signal.aborted) {
    try {
      await streamWorkflowEventsOnce(options);
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      console.warn("Workflow event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamWorkflowEventsOnce(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  sendEvent: (event: WorkflowEvent) => void;
  signal: AbortSignal;
}) {
  const response = await options.fetchImpl(
    new URL(backendEndpoints.WorkflowEventStream.path, options.baseURL),
    {
      method: backendEndpoints.WorkflowEventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`workflow event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("workflow event stream returned no response body");
  }
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return;
    }
    options.sendEvent(decodeWorkflowEvent(JSON.parse(message.data)));
  }
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
