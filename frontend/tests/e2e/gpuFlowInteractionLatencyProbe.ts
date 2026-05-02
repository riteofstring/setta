import type { Page } from "@playwright/test";
import type {
  GpuFlowPerformanceSnapshot,
  GpuFlowQueueCall,
} from "./gpuFlowPerformanceProbe";

export const GPU_FLOW_INTERACTION_LATENCY_PROBE_KEY =
  "__settaGpuFlowInteractionLatencyProbe";

export type GpuFlowInteractionLatencyStartEvent =
  | "beforeinput"
  | "change"
  | "click"
  | "input"
  | "keydown"
  | "pointerdown";

export type GpuFlowInteractionLatencyResponseDescriptor =
  | {
      readonly expectedValue?: boolean | number | string | null | undefined;
      readonly kind: "attribute";
      readonly name: string;
    }
  | {
      readonly expectedValue?: boolean | number | string | null | undefined;
      readonly kind: "class-token";
      readonly token: string;
    }
  | {
      readonly expectedValue?: boolean | number | string | null | undefined;
      readonly kind: "property";
      readonly name: string;
    }
  | {
      readonly expectedValue?: boolean | number | string | null | undefined;
      readonly kind: "text";
    };

export type BeginGpuFlowInteractionLatencySampleInput = {
  readonly response: GpuFlowInteractionLatencyResponseDescriptor;
  readonly responseSelector?: string | undefined;
  readonly sampleId?: string | undefined;
  readonly startEvents?:
    | readonly GpuFlowInteractionLatencyStartEvent[]
    | undefined;
  readonly targetSelector: string;
  readonly timeoutMs?: number | undefined;
};

export type GpuFlowInteractionLatencySample = {
  readonly endResponseValue: boolean | number | string | null;
  readonly id: string;
  readonly latencyMs: number;
  readonly responseSelector: string | null;
  readonly responseTimeMs: number;
  readonly startEventType: string;
  readonly startResponseValue: boolean | number | string | null;
  readonly startTimeMs: number;
  readonly targetSelector: string;
};

export type GpuFlowInteractionLatencyOperationSummary = {
  readonly activeTextureUploadsBeforeResponse: number;
  readonly durationMs: number;
  readonly longTasks: {
    readonly count: number;
    readonly worstDurationMs: number | null;
  };
  readonly nodeTextureUploadsAfterResponse: number;
  readonly nodeTextureUploadsBeforeResponse: number;
  readonly nodeTextureUploadsTotal: number;
  readonly textureUploadsTotal: number;
  readonly writeBufferCalls: number;
  readonly writeBufferCallsByLabel: Readonly<Record<string, number>>;
};

export async function installGpuFlowInteractionLatencyProbe(
  page: Page,
): Promise<void> {
  const initScript = createGpuFlowInteractionLatencyProbeInitScript();
  await page.addInitScript({
    content: initScript,
  });
  await page.evaluate((script) => {
    window.eval(script);
  }, initScript);
}

export async function installGpuFlowInteractionLatencyProbeForCurrentPage(
  page: Page,
): Promise<void> {
  await page.evaluate((script) => {
    window.eval(script);
  }, createGpuFlowInteractionLatencyProbeInitScript());
}

export async function beginGpuFlowInteractionLatencySample(
  page: Page,
  input: BeginGpuFlowInteractionLatencySampleInput,
): Promise<string> {
  return page.evaluate(
    ({ input: pageInput, probeKey }) => {
      const api = (
        window as Window &
          Record<
            string,
            {
              begin(
                input: BeginGpuFlowInteractionLatencySampleInput,
              ): string;
            }
          >
      )[probeKey];
      if (!api) {
        throw new Error(
          "Setta GPU flow interaction latency probe is not installed.",
        );
      }
      return api.begin(pageInput);
    },
    {
      input,
      probeKey: GPU_FLOW_INTERACTION_LATENCY_PROBE_KEY,
    },
  );
}

export async function waitForGpuFlowInteractionLatencySample(
  page: Page,
  sampleId: string,
  timeoutMs = 1_000,
): Promise<GpuFlowInteractionLatencySample> {
  return page.evaluate(
    ({ probeKey, sampleId: pageSampleId, timeoutMs: pageTimeoutMs }) => {
      const api = (
        window as Window &
          Record<
            string,
            {
              wait(
                sampleId: string,
                timeoutMs: number,
              ): Promise<GpuFlowInteractionLatencySample>;
            }
          >
      )[probeKey];
      if (!api) {
        throw new Error(
          "Setta GPU flow interaction latency probe is not installed.",
        );
      }
      return api.wait(pageSampleId, pageTimeoutMs);
    },
    {
      probeKey: GPU_FLOW_INTERACTION_LATENCY_PROBE_KEY,
      sampleId,
      timeoutMs,
    },
  );
}

export function createGpuFlowInteractionLatencyProbeInitScript(): string {
  return [
    `const DEFAULT_GPU_FLOW_INTERACTION_LATENCY_START_EVENTS = ${JSON.stringify(
      DEFAULT_GPU_FLOW_INTERACTION_LATENCY_START_EVENTS,
    )};`,
    normalizeLatencySampleId.toString(),
    normalizeLatencyStartEvents.toString(),
    readLatencyResponseValue.toString(),
    responseValueMatches.toString(),
    `(${installGpuFlowInteractionLatencyProbeInPage.toString()})();`,
  ].join("\n");
}

export function summarizeGpuFlowInteractionLatencyOperations(
  sample: GpuFlowInteractionLatencySample,
  snapshot: GpuFlowPerformanceSnapshot,
  options: {
    readonly endTimeMs?: number | undefined;
    readonly nodeId?: string | undefined;
  } = {},
): GpuFlowInteractionLatencyOperationSummary {
  const endTimeMs = options.endTimeMs ?? snapshot.timestampMs;
  const nodeId = options.nodeId;
  const calls = snapshot.queueCalls.filter(
    (call) =>
      call.timestampMs >= sample.startTimeMs && call.timestampMs <= endTimeMs,
  );
  const textureUploads = calls.filter(
    (call) => call.method === "copyElementImageToTexture",
  );
  const nodeTextureUploads = nodeId
    ? textureUploads.filter((call) => call.sourceNodeId === nodeId)
    : textureUploads;
  const nodeTextureUploadsBeforeResponse = nodeTextureUploads.filter(
    (call) => call.timestampMs <= sample.responseTimeMs,
  );
  const nodeTextureUploadsAfterResponse = nodeTextureUploads.filter(
    (call) => call.timestampMs > sample.responseTimeMs,
  );
  const writeBufferCalls = calls.filter(
    (call) => call.method === "writeBuffer",
  );
  const longTasks = snapshot.longTasks.filter(
    (task) =>
      task.startTimeMs >= sample.startTimeMs && task.startTimeMs <= endTimeMs,
  );

  return {
    activeTextureUploadsBeforeResponse:
      nodeTextureUploadsBeforeResponse.filter(isInteractiveTextureUpload).length,
    durationMs: endTimeMs - sample.startTimeMs,
    longTasks: {
      count: longTasks.length,
      worstDurationMs:
        longTasks.length === 0
          ? null
          : Math.max(...longTasks.map((task) => task.durationMs)),
    },
    nodeTextureUploadsAfterResponse: nodeTextureUploadsAfterResponse.length,
    nodeTextureUploadsBeforeResponse: nodeTextureUploadsBeforeResponse.length,
    nodeTextureUploadsTotal: nodeTextureUploads.length,
    textureUploadsTotal: textureUploads.length,
    writeBufferCalls: writeBufferCalls.length,
    writeBufferCallsByLabel: countWriteBuffersByLabel(writeBufferCalls),
  };
}

const DEFAULT_GPU_FLOW_INTERACTION_LATENCY_START_EVENTS = [
  "pointerdown",
  "keydown",
  "beforeinput",
  "input",
  "change",
] as const satisfies readonly GpuFlowInteractionLatencyStartEvent[];

function isInteractiveTextureUpload(call: GpuFlowQueueCall): boolean {
  return (
    call.method === "copyElementImageToTexture" &&
    call.sourceInteractive === true
  );
}

function countWriteBuffersByLabel(
  calls: readonly GpuFlowQueueCall[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const call of calls) {
    const label = call.bufferLabel ?? "unlabeled";
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

function installGpuFlowInteractionLatencyProbeInPage() {
  const probeKey = "__settaGpuFlowInteractionLatencyProbe";
  const win = window as Window &
    typeof globalThis & {
      [probeKey]?: unknown;
    };
  const existing = win[probeKey] as { version?: number } | undefined;
  if (existing?.version === 1) {
    return;
  }

  type SampleWaiter = {
    reject: (reason: Error) => void;
    resolve: (sample: GpuFlowInteractionLatencySample) => void;
    timer: ReturnType<typeof window.setTimeout>;
  };
  type SampleRecord = {
    cleanup: () => void;
    completed: boolean;
    error: Error | null;
    id: string;
    input: BeginGpuFlowInteractionLatencySampleInput;
    observer: MutationObserver | null;
    responseElement: HTMLElement;
    sample: GpuFlowInteractionLatencySample | null;
    started: boolean;
    targetElement: HTMLElement;
    waiters: SampleWaiter[];
  };

  const samples = new Map<string, SampleRecord>();

  function resolveTarget(selector: string): HTMLElement {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      throw new Error(
        `GPU flow interaction latency target not found: ${selector}.`,
      );
    }
    return element;
  }

  function begin(input: BeginGpuFlowInteractionLatencySampleInput): string {
    const id = normalizeLatencySampleId(input.sampleId);
    if (samples.has(id)) {
      throw new Error(`GPU flow interaction latency sample already exists: ${id}.`);
    }
    const targetElement = resolveTarget(input.targetSelector);
    const responseElement = input.responseSelector
      ? resolveTarget(input.responseSelector)
      : targetElement;
    const record: SampleRecord = {
      cleanup: () => {},
      completed: false,
      error: null,
      id,
      input,
      observer: null,
      responseElement,
      sample: null,
      started: false,
      targetElement,
      waiters: [],
    };

    const startEvents = normalizeLatencyStartEvents(input.startEvents);
    const abortController = new AbortController();
    const onStartEvent = (event: Event) => {
      startSample(record, event);
    };
    for (const eventName of startEvents) {
      targetElement.addEventListener(eventName, onStartEvent, {
        capture: true,
        signal: abortController.signal,
      });
    }
    record.cleanup = () => {
      abortController.abort();
      record.observer?.disconnect();
      record.observer = null;
    };
    samples.set(id, record);
    return id;
  }

  function startSample(record: SampleRecord, event: Event) {
    if (record.started || record.completed) {
      return;
    }
    record.started = true;
    const startTimeMs = performance.now();
    const startResponseValue = readLatencyResponseValue(
      record.responseElement,
      record.input.response,
    );
    let active = true;
    const timeoutMs = record.input.timeoutMs ?? 1_000;
    const startDeadlineMs = startTimeMs + timeoutMs;

    const completeIfReady = () => {
      if (!active || record.completed) {
        return;
      }
      const endResponseValue = readLatencyResponseValue(
        record.responseElement,
        record.input.response,
      );
      const expectedValue = record.input.response.expectedValue;
      const responseChanged = endResponseValue !== startResponseValue;
      const expectedMatched =
        expectedValue !== undefined &&
        responseValueMatches(endResponseValue, expectedValue);
      const responseReady =
        expectedValue === undefined ? responseChanged : expectedMatched;
      if (!responseReady) {
        if (performance.now() > startDeadlineMs) {
          failRecord(
            record,
            new Error(
              `GPU flow interaction latency sample timed out: ${
                record.id
              }.`,
            ),
          );
          active = false;
          return;
        }
        window.requestAnimationFrame(completeIfReady);
        return;
      }
      const responseTimeMs = performance.now();
      active = false;
      completeRecord(record, {
        endResponseValue,
        id: record.id,
        latencyMs: responseTimeMs - startTimeMs,
        responseSelector: record.input.responseSelector ?? null,
        responseTimeMs,
        startEventType: event.type,
        startResponseValue,
        startTimeMs,
        targetSelector: record.input.targetSelector,
      });
    };

    record.observer = new MutationObserver(completeIfReady);
    record.observer.observe(record.responseElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    queueMicrotask(completeIfReady);
    window.requestAnimationFrame(completeIfReady);
  }

  function completeRecord(
    record: SampleRecord,
    sample: GpuFlowInteractionLatencySample,
  ) {
    record.completed = true;
    record.sample = sample;
    record.cleanup();
    for (const waiter of record.waiters) {
      window.clearTimeout(waiter.timer);
      waiter.resolve(record.sample);
    }
    record.waiters = [];
  }

  function failRecord(record: SampleRecord, error: Error) {
    record.completed = true;
    record.error = error;
    record.cleanup();
    for (const waiter of record.waiters) {
      window.clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    record.waiters = [];
  }

  function wait(
    sampleId: string,
    timeoutMs: number,
  ): Promise<GpuFlowInteractionLatencySample> {
    const record = samples.get(sampleId);
    if (!record) {
      throw new Error(`GPU flow interaction latency sample not found: ${sampleId}.`);
    }
    if (record.sample) {
      return Promise.resolve(record.sample);
    }
    if (record.error) {
      return Promise.reject(record.error);
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(
          new Error(
            `GPU flow interaction latency wait timed out: ${sampleId}.`,
          ),
        );
      }, timeoutMs);
      record.waiters.push({ reject, resolve, timer });
    });
  }

  function snapshot(sampleId: string): GpuFlowInteractionLatencySample | null {
    const record = samples.get(sampleId);
    if (!record) {
      throw new Error(`GPU flow interaction latency sample not found: ${sampleId}.`);
    }
    return record.sample;
  }

  win[probeKey] = {
    begin,
    snapshot,
    uninstall() {
      for (const record of samples.values()) {
        record.cleanup();
      }
      samples.clear();
      delete win[probeKey];
    },
    version: 1,
    wait,
  };
}

function normalizeLatencySampleId(sampleId: string | undefined): string {
  if (sampleId && sampleId.trim().length > 0) {
    return sampleId;
  }
  return `gpu-flow-interaction-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function normalizeLatencyStartEvents(
  startEvents:
    | readonly GpuFlowInteractionLatencyStartEvent[]
    | undefined,
): readonly GpuFlowInteractionLatencyStartEvent[] {
  return startEvents && startEvents.length > 0
    ? [...startEvents]
    : DEFAULT_GPU_FLOW_INTERACTION_LATENCY_START_EVENTS;
}

function readLatencyResponseValue(
  element: HTMLElement,
  descriptor: GpuFlowInteractionLatencyResponseDescriptor,
): boolean | number | string | null {
  if (descriptor.kind === "attribute") {
    return element.getAttribute(descriptor.name);
  }
  if (descriptor.kind === "class-token") {
    return element.classList.contains(descriptor.token);
  }
  if (descriptor.kind === "text") {
    return element.textContent;
  }
  const value = (element as unknown as Record<string, unknown>)[
    descriptor.name
  ];
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  return value === null ? null : String(value);
}

function responseValueMatches(
  value: boolean | number | string | null,
  expected: boolean | number | string | null,
): boolean {
  return value === expected;
}
