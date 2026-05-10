import type { Page } from "@playwright/test";

export const GPU_FLOW_PERFORMANCE_PROBE_KEY = "__settaGpuFlowPerformanceProbe";

export type GpuFlowQueueMethodName =
  | "copyElementImageToTexture"
  | "writeBuffer";

export type GpuFlowQueueCall = {
  readonly bufferLabel?: string | undefined;
  readonly byteLength?: number | undefined;
  readonly height?: number | undefined;
  readonly index: number;
  readonly method: GpuFlowQueueMethodName;
  readonly sourceHeight?: number | undefined;
  readonly sourceInteractive?: boolean | undefined;
  readonly sourceNodeId?: string | undefined;
  readonly sourceWidth?: number | undefined;
  readonly sourceX?: number | undefined;
  readonly sourceY?: number | undefined;
  readonly timestampMs: number;
  readonly width?: number | undefined;
};

export type GpuFlowRequestPaintCall = {
  readonly index: number;
  readonly timestampMs: number;
};

export type GpuFlowSourceMutation = {
  readonly attributeName: string;
  readonly index: number;
  readonly sourceNodeId?: string | undefined;
  readonly timestampMs: number;
  readonly transformChanged: boolean;
};

export type GpuFlowLongTask = {
  readonly durationMs: number;
  readonly name: string;
  readonly startTimeMs: number;
};

export type GpuFlowNodeLayerFrameProbeSummary = {
  readonly activeNodeId: string | null;
  readonly budgetExhausted: boolean;
  readonly drawnEdgeCount: number;
  readonly drawnNodeCount: number;
  readonly edgeVertexCount: number;
  readonly evictedTextureBytes: number;
  readonly evictedTextureNodeIds: readonly string[];
  readonly missingElementNodeCount: number;
  readonly missingTextureNodeCount: number;
  readonly remainingDirtyNodeCount: number;
  readonly skippedNodeCount: number;
  readonly solidRoundedRectSurfaceCount: number;
  readonly textureAllocatedBytes: number;
  readonly textureCount: number;
  readonly textureLargestBytes: number;
  readonly textureVisibleBytes: number;
  readonly timestampMs: number;
  readonly uploadedNodeIds: readonly string[];
  readonly viewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly visibleNodeCount: number;
};

export type GpuFlowPerformanceSnapshot = {
  readonly frameCount: number;
  readonly frameIntervalsMs: readonly number[];
  readonly installedAtMs: number;
  readonly longTasks: readonly GpuFlowLongTask[];
  readonly nodeLayerFrames: readonly GpuFlowNodeLayerFrameProbeSummary[];
  readonly queueCalls: readonly GpuFlowQueueCall[];
  readonly queueWrappersInstalled: boolean;
  readonly requestPaintCalls: readonly GpuFlowRequestPaintCall[];
  readonly sourceMutations: readonly GpuFlowSourceMutation[];
  readonly timestampMs: number;
};

export type GpuFlowPerformanceSummary = {
  readonly durationMs: number;
  readonly frame: {
    readonly averageFps: number | null;
    readonly averageIntervalMs: number | null;
    readonly count: number;
    readonly worstIntervalMs: number | null;
  };
  readonly latestNodeLayerFrame: GpuFlowNodeLayerFrameProbeSummary | null;
  readonly longTasks: {
    readonly count: number;
    readonly worstDurationMs: number | null;
  };
  readonly queue: {
    readonly activeTextureUploads: number;
    readonly passiveTextureUploads: number;
    readonly textureUploads: number;
    readonly textureUploadsByNodeId: Readonly<Record<string, number>>;
    readonly unknownTextureUploads: number;
    readonly writeBufferBytesByLabel: Readonly<Record<string, number>>;
    readonly writeBufferCalls: number;
    readonly writeBufferCallsByLabel: Readonly<Record<string, number>>;
  };
  readonly requestPaintCalls: number;
  readonly sourceMutations: {
    readonly total: number;
    readonly transformWrites: number;
  };
};

export async function installGpuFlowPerformanceProbe(
  page: Page,
): Promise<void> {
  const initScript = createGpuFlowPerformanceProbeInitScript();
  await page.addInitScript({
    content: initScript,
  });
  await page.evaluate((script) => {
    window.eval(script);
  }, initScript);
}

export async function installGpuFlowPerformanceProbeForCurrentPage(
  page: Page,
): Promise<void> {
  await page.evaluate((script) => {
    window.eval(script);
  }, createGpuFlowPerformanceProbeInitScript());
}

export async function resetGpuFlowPerformanceProbe(page: Page): Promise<void> {
  await page.evaluate((probeKey) => {
    const api = (window as Window & Record<string, { reset(): void }>)[
      probeKey
    ];
    if (!api) {
      throw new Error("Setta GPU flow performance probe is not installed.");
    }
    api.reset();
  }, GPU_FLOW_PERFORMANCE_PROBE_KEY);
}

export async function ensureGpuFlowPerformanceQueueWrappers(
  page: Page,
): Promise<boolean> {
  return page.evaluate((probeKey) => {
    const api = (
      window as Window & Record<string, { installQueueWrappers(): boolean }>
    )[probeKey];
    if (!api) {
      throw new Error("Setta GPU flow performance probe is not installed.");
    }
    return api.installQueueWrappers();
  }, GPU_FLOW_PERFORMANCE_PROBE_KEY);
}

export async function setGpuFlowPerformanceSourceMutationRecording(
  page: Page,
  enabled: boolean,
): Promise<void> {
  await page.evaluate(
    ({ enabled, probeKey }) => {
      const api = (
        window as Window &
          Record<string, { setSourceMutationRecording(enabled: boolean): void }>
      )[probeKey];
      if (!api) {
        throw new Error("Setta GPU flow performance probe is not installed.");
      }
      api.setSourceMutationRecording(enabled);
    },
    { enabled, probeKey: GPU_FLOW_PERFORMANCE_PROBE_KEY },
  );
}

export async function readGpuFlowPerformanceSnapshot(
  page: Page,
): Promise<GpuFlowPerformanceSnapshot> {
  return page.evaluate((probeKey) => {
    const api = (
      window as Window &
        Record<string, { snapshot(): GpuFlowPerformanceSnapshot }>
    )[probeKey];
    if (!api) {
      throw new Error("Setta GPU flow performance probe is not installed.");
    }
    return api.snapshot();
  }, GPU_FLOW_PERFORMANCE_PROBE_KEY);
}

export async function readGpuFlowPerformanceSummary(
  page: Page,
): Promise<GpuFlowPerformanceSummary> {
  return summarizeGpuFlowPerformanceSnapshot(
    await readGpuFlowPerformanceSnapshot(page),
  );
}

export async function uninstallGpuFlowPerformanceProbe(
  page: Page,
): Promise<void> {
  await page.evaluate((probeKey) => {
    const api = (window as Window & Record<string, { uninstall(): void }>)[
      probeKey
    ];
    if (!api) {
      throw new Error("Setta GPU flow performance probe is not installed.");
    }
    api.uninstall();
  }, GPU_FLOW_PERFORMANCE_PROBE_KEY);
}

export function createGpuFlowPerformanceProbeInitScript(): string {
  return [
    getGpuQueueMethod.toString(),
    recordCopyElementImageToTextureCall.toString(),
    isCopyElementImageToTextureSourceRectCall.toString(),
    recordWriteBufferCall.toString(),
    recordSourceMutation.toString(),
    startSourceMutationObserver.toString(),
    stopSourceMutationObserver.toString(),
    hasTransformMutation.toString(),
    styleTransformValue.toString(),
    getGpuBufferLabel.toString(),
    getWriteBufferByteLength.toString(),
    toNodeLayerFrameSummary.toString(),
    viewportValue.toString(),
    objectValue.toString(),
    numberValue.toString(),
    arrayLength.toString(),
    numberOrArrayLength.toString(),
    stringArray.toString(),
    `(${installGpuFlowPerformanceProbeInPage.toString()})();`,
  ].join("\n");
}

export function summarizeGpuFlowPerformanceSnapshot(
  snapshot: GpuFlowPerformanceSnapshot,
): GpuFlowPerformanceSummary {
  const textureUploadsByNodeId: Record<string, number> = {};
  const writeBufferCallsByLabel: Record<string, number> = {};
  const writeBufferBytesByLabel: Record<string, number> = {};
  let activeTextureUploads = 0;
  let passiveTextureUploads = 0;
  let textureUploads = 0;
  let unknownTextureUploads = 0;
  let writeBufferCalls = 0;
  let sourceTransformWrites = 0;

  for (const call of snapshot.queueCalls) {
    if (call.method === "copyElementImageToTexture") {
      textureUploads += 1;
      if (call.sourceInteractive === true) {
        activeTextureUploads += 1;
      } else if (call.sourceInteractive === false) {
        passiveTextureUploads += 1;
      } else {
        unknownTextureUploads += 1;
      }
      if (call.sourceNodeId) {
        incrementRecord(textureUploadsByNodeId, call.sourceNodeId, 1);
      }
      continue;
    }

    writeBufferCalls += 1;
    const label = call.bufferLabel ?? "unlabeled";
    incrementRecord(writeBufferCallsByLabel, label, 1);
    incrementRecord(writeBufferBytesByLabel, label, call.byteLength ?? 0);
  }

  const averageIntervalMs = average(snapshot.frameIntervalsMs);
  const worstIntervalMs = maxOrNull(snapshot.frameIntervalsMs);
  const worstLongTaskMs = maxOrNull(
    snapshot.longTasks.map((task) => task.durationMs),
  );
  for (const mutation of snapshot.sourceMutations) {
    if (mutation.transformChanged) {
      sourceTransformWrites += 1;
    }
  }

  return {
    durationMs: snapshot.timestampMs - snapshot.installedAtMs,
    frame: {
      averageFps:
        averageIntervalMs === null || averageIntervalMs <= 0
          ? null
          : 1_000 / averageIntervalMs,
      averageIntervalMs,
      count: snapshot.frameCount,
      worstIntervalMs,
    },
    latestNodeLayerFrame:
      snapshot.nodeLayerFrames[snapshot.nodeLayerFrames.length - 1] ?? null,
    longTasks: {
      count: snapshot.longTasks.length,
      worstDurationMs: worstLongTaskMs,
    },
    queue: {
      activeTextureUploads,
      passiveTextureUploads,
      textureUploads,
      textureUploadsByNodeId,
      unknownTextureUploads,
      writeBufferBytesByLabel,
      writeBufferCalls,
      writeBufferCallsByLabel,
    },
    requestPaintCalls: snapshot.requestPaintCalls.length,
    sourceMutations: {
      total: snapshot.sourceMutations.length,
      transformWrites: sourceTransformWrites,
    },
  };
}

function incrementRecord(
  record: Record<string, number>,
  key: string,
  amount: number,
) {
  record[key] = (record[key] ?? 0) + amount;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxOrNull(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}

function installGpuFlowPerformanceProbeInPage() {
  const probeKey = "__settaGpuFlowPerformanceProbe";
  const win = window as Window &
    typeof globalThis & {
      GPUQueue?: { prototype?: Record<string, unknown> } | undefined;
      HTMLCanvasElement?: { prototype?: Record<string, unknown> } | undefined;
      [probeKey]?: unknown;
    };
  const existing = win[probeKey] as
    | { installQueueWrappers?: () => boolean; version?: number }
    | undefined;
  if (existing?.version === 4) {
    existing.installQueueWrappers?.();
    return;
  }

  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCanvasRequestPaint =
    typeof win.HTMLCanvasElement?.prototype?.requestPaint === "function"
      ? (win.HTMLCanvasElement.prototype.requestPaint as (
          ...args: unknown[]
        ) => unknown)
      : null;
  const originalCopyElementImageToTexture = getGpuQueueMethod(
    win,
    "copyElementImageToTexture",
  );
  const originalWriteBuffer = getGpuQueueMethod(win, "writeBuffer");
  const state = {
    frameCount: 0,
    frameIntervalsMs: [] as number[],
    installedAtMs: performance.now(),
    lastFrameTimestampMs: null as number | null,
    longTaskObserver: null as PerformanceObserver | null,
    longTasks: [] as GpuFlowLongTask[],
    nodeLayerFrames: [] as GpuFlowNodeLayerFrameProbeSummary[],
    queueCalls: [] as GpuFlowQueueCall[],
    queueWrappersInstalled: false,
    requestPaintCalls: [] as GpuFlowRequestPaintCall[],
    sourceMutationRecording: true,
    sourceMutationObserver: null as MutationObserver | null,
    sourceMutations: [] as GpuFlowSourceMutation[],
  };

  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    return originalRequestAnimationFrame.call(window, (timestamp) => {
      if (state.lastFrameTimestampMs !== null) {
        state.frameIntervalsMs.push(timestamp - state.lastFrameTimestampMs);
      }
      state.frameCount += 1;
      state.lastFrameTimestampMs = timestamp;
      callback(timestamp);
    });
  };

  if (originalCanvasRequestPaint && win.HTMLCanvasElement?.prototype) {
    win.HTMLCanvasElement.prototype.requestPaint = function (
      this: unknown,
      ...args: unknown[]
    ) {
      state.requestPaintCalls.push({
        index: state.requestPaintCalls.length,
        timestampMs: performance.now(),
      });
      return originalCanvasRequestPaint.apply(this, args);
    };
  }

  startSourceMutationObserver(state);

  if (
    typeof PerformanceObserver === "function" &&
    PerformanceObserver.supportedEntryTypes.includes("longtask")
  ) {
    state.longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longTasks.push({
          durationMs: entry.duration,
          name: entry.name,
          startTimeMs: entry.startTime,
        });
      }
    });
    state.longTaskObserver.observe({ entryTypes: ["longtask"] });
  }

  const api = {
    installQueueWrappers() {
      const queuePrototype = win.GPUQueue?.prototype;
      if (!queuePrototype) {
        state.queueWrappersInstalled = false;
        return false;
      }

      if (typeof originalCopyElementImageToTexture === "function") {
        queuePrototype.copyElementImageToTexture = function (
          this: unknown,
          ...args: unknown[]
        ) {
          recordCopyElementImageToTextureCall(state, args);
          return originalCopyElementImageToTexture.apply(this, args);
        };
      }
      if (typeof originalWriteBuffer === "function") {
        queuePrototype.writeBuffer = function (
          this: unknown,
          ...args: unknown[]
        ) {
          recordWriteBufferCall(state, args);
          return originalWriteBuffer.apply(this, args);
        };
      }

      state.queueWrappersInstalled =
        typeof queuePrototype.copyElementImageToTexture === "function" ||
        typeof queuePrototype.writeBuffer === "function";
      return state.queueWrappersInstalled;
    },
    recordNodeLayerFrame(result: unknown) {
      state.nodeLayerFrames.push(toNodeLayerFrameSummary(result));
    },
    reset() {
      state.frameCount = 0;
      state.frameIntervalsMs = [];
      state.installedAtMs = performance.now();
      state.lastFrameTimestampMs = null;
      state.longTasks = [];
      state.nodeLayerFrames = [];
      state.queueCalls = [];
      state.requestPaintCalls = [];
      state.sourceMutations = [];
    },
    setSourceMutationRecording(enabled: boolean) {
      state.sourceMutationRecording = enabled;
      if (enabled) {
        startSourceMutationObserver(state);
        return;
      }
      stopSourceMutationObserver(state);
    },
    snapshot(): GpuFlowPerformanceSnapshot {
      return {
        frameCount: state.frameCount,
        frameIntervalsMs: [...state.frameIntervalsMs],
        installedAtMs: state.installedAtMs,
        longTasks: [...state.longTasks],
        nodeLayerFrames: [...state.nodeLayerFrames],
        queueCalls: [...state.queueCalls],
        queueWrappersInstalled: state.queueWrappersInstalled,
        requestPaintCalls: [...state.requestPaintCalls],
        sourceMutations: [...state.sourceMutations],
        timestampMs: performance.now(),
      };
    },
    uninstall() {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      if (originalCanvasRequestPaint && win.HTMLCanvasElement?.prototype) {
        win.HTMLCanvasElement.prototype.requestPaint =
          originalCanvasRequestPaint;
      }
      const queuePrototype = win.GPUQueue?.prototype;
      if (queuePrototype) {
        if (originalCopyElementImageToTexture) {
          queuePrototype.copyElementImageToTexture =
            originalCopyElementImageToTexture;
        }
        if (originalWriteBuffer) {
          queuePrototype.writeBuffer = originalWriteBuffer;
        }
      }
      state.longTaskObserver?.disconnect();
      stopSourceMutationObserver(state);
      delete win[probeKey];
    },
    version: 4,
  };
  win[probeKey] = api;
  api.installQueueWrappers();
}

function getGpuQueueMethod(
  win: Window & {
    GPUQueue?: { prototype?: Record<string, unknown> } | undefined;
  },
  methodName: GpuFlowQueueMethodName,
): ((...args: unknown[]) => unknown) | null {
  const method = win.GPUQueue?.prototype?.[methodName];
  return typeof method === "function" ? method : null;
}

function recordCopyElementImageToTextureCall(
  state: { queueCalls: GpuFlowQueueCall[] },
  args: readonly unknown[],
) {
  const sourceElement = args[0] instanceof Element ? args[0] : null;
  const sourceRectCall = isCopyElementImageToTextureSourceRectCall(args);
  const sourceNode = sourceElement?.closest(
    [
      '[data-gpu-flow-node="true"]',
      '[data-gpu-flow-html-source="true"]',
      '[data-gpu-flow-surface="true"]',
    ].join(","),
  );
  state.queueCalls.push({
    height: sourceRectCall
      ? args[6]
      : typeof args[2] === "number"
        ? args[2]
        : undefined,
    index: state.queueCalls.length,
    method: "copyElementImageToTexture",
    ...(sourceRectCall
      ? {
          sourceHeight: args[4],
          sourceWidth: args[3],
          sourceX: args[1],
          sourceY: args[2],
        }
      : {}),
    sourceInteractive: sourceNode
      ? sourceNode.getAttribute("data-gpu-flow-interactive") === "true"
      : undefined,
    sourceNodeId:
      sourceNode?.getAttribute("data-id") ??
      sourceNode?.getAttribute("data-gpu-flow-source-id") ??
      sourceNode?.getAttribute("data-html-surface-id") ??
      undefined,
    timestampMs: performance.now(),
    width: sourceRectCall
      ? args[5]
      : typeof args[1] === "number"
        ? args[1]
        : undefined,
  });
}

function isCopyElementImageToTextureSourceRectCall(
  args: readonly unknown[],
): args is readonly [
  Element,
  number,
  number,
  number,
  number,
  number,
  number,
  ...unknown[],
] {
  return (
    args[0] instanceof Element &&
    typeof args[1] === "number" &&
    typeof args[2] === "number" &&
    typeof args[3] === "number" &&
    typeof args[4] === "number" &&
    typeof args[5] === "number" &&
    typeof args[6] === "number"
  );
}

function recordWriteBufferCall(
  state: { queueCalls: GpuFlowQueueCall[] },
  args: readonly unknown[],
) {
  state.queueCalls.push({
    bufferLabel: getGpuBufferLabel(args[0]),
    byteLength: getWriteBufferByteLength(args),
    index: state.queueCalls.length,
    method: "writeBuffer",
    timestampMs: performance.now(),
  });
}

function recordSourceMutation(
  state: { sourceMutations: GpuFlowSourceMutation[] },
  mutation: MutationRecord,
) {
  const target = mutation.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const sourceNode =
    target.matches('[data-gpu-flow-node="true"]') ||
    target.matches('[data-gpu-flow-surface="true"]')
      ? target
      : target.closest(
          '[data-gpu-flow-node="true"], [data-gpu-flow-surface="true"]',
        );
  if (!(sourceNode instanceof HTMLElement)) {
    return;
  }
  state.sourceMutations.push({
    attributeName: mutation.attributeName ?? "",
    index: state.sourceMutations.length,
    sourceNodeId:
      sourceNode.getAttribute("data-id") ??
      sourceNode.getAttribute("data-html-surface-id") ??
      undefined,
    timestampMs: performance.now(),
    transformChanged: hasTransformMutation(target, mutation),
  });
}

function startSourceMutationObserver(state: {
  sourceMutationRecording: boolean;
  sourceMutationObserver: MutationObserver | null;
  sourceMutations: GpuFlowSourceMutation[];
}) {
  if (
    !state.sourceMutationRecording ||
    typeof MutationObserver !== "function"
  ) {
    return;
  }
  const start = () => {
    if (state.sourceMutationObserver || !document.body) {
      return;
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        recordSourceMutation(state, mutation);
      }
    });
    observer.observe(document.body, {
      attributeFilter: ["class", "data-gpu-flow-interactive", "style"],
      attributeOldValue: true,
      attributes: true,
      subtree: true,
    });
    state.sourceMutationObserver = observer;
  };
  if (document.body) {
    start();
    return;
  }
  document.addEventListener("DOMContentLoaded", start, { once: true });
}

function stopSourceMutationObserver(state: {
  sourceMutationObserver: MutationObserver | null;
}) {
  state.sourceMutationObserver?.disconnect();
  state.sourceMutationObserver = null;
}

function hasTransformMutation(
  target: HTMLElement,
  mutation: MutationRecord,
): boolean {
  if (mutation.attributeName !== "style") {
    return false;
  }
  return (
    styleTransformValue(mutation.oldValue ?? "") !== target.style.transform
  );
}

function styleTransformValue(styleText: string): string {
  if (!styleText) {
    return "";
  }
  const probe = document.createElement("div");
  probe.setAttribute("style", styleText);
  return probe.style.transform;
}

function getGpuBufferLabel(buffer: unknown): string | undefined {
  if (!buffer || typeof buffer !== "object" || !("label" in buffer)) {
    return undefined;
  }
  const label = (buffer as { label?: unknown }).label;
  return typeof label === "string" && label.length > 0 ? label : undefined;
}

function getWriteBufferByteLength(
  args: readonly unknown[],
): number | undefined {
  if (typeof args[4] === "number") {
    return args[4];
  }
  const data = args[2];
  if (!data || typeof data !== "object" || !("byteLength" in data)) {
    return undefined;
  }
  const byteLength = (data as { byteLength?: unknown }).byteLength;
  return typeof byteLength === "number" ? byteLength : undefined;
}

function toNodeLayerFrameSummary(
  result: unknown,
): GpuFlowNodeLayerFrameProbeSummary {
  const value =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : {};
  const textureMemory = objectValue(value.textureMemory);
  const uploadDiagnostics = Array.isArray(value.uploadDiagnostics)
    ? value.uploadDiagnostics
    : [];
  return {
    activeNodeId:
      typeof value.activeNodeId === "string" ? value.activeNodeId : null,
    budgetExhausted: value.budgetExhausted === true,
    drawnEdgeCount: numberOrArrayLength(
      value.drawnEdgeCount,
      value.drawnEdgeIds,
    ),
    drawnNodeCount: numberOrArrayLength(
      value.drawnNodeCount,
      value.drawnNodeIds,
    ),
    edgeVertexCount:
      typeof value.edgeVertexCount === "number" ? value.edgeVertexCount : 0,
    evictedTextureBytes: numberValue(value.evictedTextureBytes),
    evictedTextureNodeIds: stringArray(value.evictedTextureNodeIds),
    missingElementNodeCount: numberOrArrayLength(
      value.missingElementNodeCount,
      value.missingElementNodeIds,
    ),
    missingTextureNodeCount: numberOrArrayLength(
      value.missingTextureNodeCount,
      value.missingTextureNodeIds,
    ),
    remainingDirtyNodeCount: numberOrArrayLength(
      value.remainingDirtyNodeCount,
      value.remainingDirtyNodeIds,
    ),
    skippedNodeCount: numberOrArrayLength(
      value.skippedNodeCount,
      value.skippedNodeIds,
    ),
    solidRoundedRectSurfaceCount: numberValue(
      value.solidRoundedRectSurfaceCount,
    ),
    textureAllocatedBytes:
      numberValue(value.textureMemoryAllocatedBytes) ||
      numberValue(textureMemory.allocatedBytes),
    textureCount:
      numberValue(value.textureMemoryCount) ||
      numberValue(textureMemory.textureCount),
    textureLargestBytes:
      numberValue(value.textureMemoryLargestBytes) ||
      numberValue(textureMemory.largestTextureBytes),
    textureVisibleBytes:
      numberValue(value.textureMemoryVisibleBytes) ||
      numberValue(textureMemory.visibleBytes),
    timestampMs: performance.now(),
    uploadedNodeIds:
      stringArray(value.uploadedNodeIds).length > 0
        ? stringArray(value.uploadedNodeIds)
        : uploadDiagnostics
            .map((diagnostic) =>
              diagnostic && typeof diagnostic === "object"
                ? (diagnostic as { surfaceId?: unknown }).surfaceId
                : null,
            )
            .filter(
              (surfaceId): surfaceId is string => typeof surfaceId === "string",
            ),
    viewport: viewportValue(value.viewport),
    visibleNodeCount: numberOrArrayLength(
      value.visibleNodeCount,
      value.visibleNodeIds,
    ),
  };
}

function viewportValue(value: unknown): {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
} {
  const viewport = objectValue(value);
  return {
    x: numberValue(viewport.x),
    y: numberValue(viewport.y),
    zoom: numberValue(viewport.zoom) || 1,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function numberOrArrayLength(count: unknown, values: unknown): number {
  return typeof count === "number" ? count : arrayLength(values);
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
