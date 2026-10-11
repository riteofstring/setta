export type BrowserPipelineStatus =
  "idle" | "running" | "ready" | "error" | "cancelled";

export type BrowserStageStatus = "running" | "ready" | "error";

export interface BrowserStageProgress {
  fraction?: number;
  message?: string;
}

export interface BrowserStageContext<Input> {
  input: Input;
  dependencies: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
  reportProgress: (progress: BrowserStageProgress) => void;
}

export interface BrowserPipelineStage<Input> {
  id: string;
  dependencies?: readonly string[];
  run: (context: BrowserStageContext<Input>) => unknown | Promise<unknown>;
}

export interface BrowserPipelineSnapshot<Output> {
  revision: number;
  outputRevision: number | null;
  status: BrowserPipelineStatus;
  output: Output | null;
  stages: Readonly<Record<string, BrowserStageStatus>>;
  progress: Readonly<Record<string, BrowserStageProgress>>;
  error: string | null;
}

export interface BrowserPipeline<Input, Output> {
  run: (input: Input) => number;
  cancel: () => void;
  dispose: () => void;
  getSnapshot: () => BrowserPipelineSnapshot<Output>;
  subscribe: (listener: () => void) => () => void;
}

export interface BrowserPipelineWorker {
  postMessage: (message: unknown) => void;
  addEventListener: (
    type: "message" | "error" | "messageerror",
    listener: EventListener,
  ) => void;
  removeEventListener: (
    type: "message" | "error" | "messageerror",
    listener: EventListener,
  ) => void;
  terminate: () => void;
}

export interface BrowserPipelineWorkerScope {
  postMessage: (message: unknown) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
}

export type BrowserPipelineMessage =
  | { type: "stage"; revision: number; id: string; status: BrowserStageStatus }
  | {
      type: "progress";
      revision: number;
      id: string;
      progress: BrowserStageProgress;
    }
  | { type: "result"; revision: number; output: Record<string, unknown> }
  | { type: "error"; revision: number; error: string };
