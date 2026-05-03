import type { Page } from "@playwright/test";

export const GPU_FLOW_VISUAL_PARITY_PROBE_KEY =
  "__settaGpuFlowVisualParityProbe";

export type GpuFlowVisualParityPhase =
  | "passive-before"
  | "live-before-input"
  | "live-during-input"
  | "restored-after-upload";

export type GpuFlowVisualParityRect = {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type GpuFlowVisualParityRectInput = Pick<
  GpuFlowVisualParityRect,
  "height" | "width" | "x" | "y"
>;

export type GpuFlowVisualParityRectDelta = {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly maxAbsCssPx: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type GpuFlowVisualParityTextureMetadata = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly devicePixelRatio: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly resolutionScale: number;
  readonly samplerMagFilter?: string | undefined;
  readonly samplerMinFilter?: string | undefined;
  readonly zoom: number;
  readonly zoomBucket: number;
};

export type GpuFlowVisualParityUploadState = {
  readonly activeTextureUploadCountForNode: number;
  readonly lastNodeLayerFrameUploadedNode: boolean | null;
  readonly lastTextureUpload:
    | {
        readonly height: number | null;
        readonly sourceInteractive: boolean | null;
        readonly timestampMs: number | null;
        readonly width: number | null;
      }
    | null;
  readonly nodeLayerFrameCount: number;
  readonly passiveTextureUploadCountForNode: number;
  readonly textureUploadCountForNode: number;
};

export type GpuFlowVisualParityScrollOffset = {
  readonly path: readonly number[];
  readonly scrollLeft: number;
  readonly scrollTop: number;
};

export type GpuFlowVisualParityStyleProperty =
  (typeof GPU_FLOW_VISUAL_PARITY_STYLE_PROPERTIES)[number];

export type GpuFlowVisualParityStyleSnapshot = Readonly<
  Record<GpuFlowVisualParityStyleProperty, string>
>;

export type GpuFlowVisualParitySnapshot = {
  readonly devicePixelRatio: number;
  readonly expectedRect: GpuFlowVisualParityRect | null;
  readonly expectedRectDelta: GpuFlowVisualParityRectDelta | null;
  readonly expectedSnappedRectDelta: GpuFlowVisualParityRectDelta | null;
  readonly nodeId: string;
  readonly phase: GpuFlowVisualParityPhase;
  readonly rect: GpuFlowVisualParityRect;
  readonly scrollOffsets: readonly GpuFlowVisualParityScrollOffset[];
  readonly snappedRect: GpuFlowVisualParityRect;
  readonly style: GpuFlowVisualParityStyleSnapshot;
  readonly texture: GpuFlowVisualParityTextureMetadata | null;
  readonly timestampMs: number;
  readonly uploadState: GpuFlowVisualParityUploadState | null;
};

export type GpuFlowVisualParityScreenshotRegionOptions = {
  readonly insetCssPx?:
    | number
    | {
        readonly bottom?: number | undefined;
        readonly left?: number | undefined;
        readonly right?: number | undefined;
        readonly top?: number | undefined;
      }
    | undefined;
  readonly maxHeightCssPx?: number | undefined;
  readonly maxWidthCssPx?: number | undefined;
  readonly minHeightCssPx?: number | undefined;
  readonly minWidthCssPx?: number | undefined;
  readonly regionId?: string | undefined;
};

export type GpuFlowVisualParityScreenshotRegion = {
  readonly byteLength: number;
  readonly clip: GpuFlowVisualParityRectInput;
  readonly nodeId: string;
  readonly path: string | null;
  readonly phase: GpuFlowVisualParityPhase;
  readonly regionId: string;
  readonly sourceRect: GpuFlowVisualParityRect;
};

export type GpuFlowVisualParityRgbaRegion = {
  readonly data: ArrayLike<number>;
  readonly height: number;
  readonly width: number;
};

export type GpuFlowVisualParityPixelDiffOptions = {
  readonly changedPixelChannelThreshold?: number | undefined;
  readonly maxChangedPixelRatio?: number | undefined;
  readonly maxChannelDelta?: number | undefined;
};

export type GpuFlowVisualParityPixelDiffSummary = {
  readonly changedPixelCount: number;
  readonly changedPixelRatio: number;
  readonly height: number;
  readonly maxChannelDelta: number;
  readonly meanAbsoluteChannelDelta: number;
  readonly pixelCount: number;
  readonly withinTolerance: boolean;
  readonly width: number;
};

export type GpuFlowVisualParitySnapshotDelta = {
  readonly candidatePhase: GpuFlowVisualParityPhase;
  readonly maxRectDeltaCssPx: number;
  readonly maxSnappedRectDeltaCssPx: number;
  readonly referencePhase: GpuFlowVisualParityPhase;
  readonly scrollOffsetMismatches: readonly GpuFlowVisualParityScrollOffsetMismatch[];
  readonly styleMismatches: readonly GpuFlowVisualParityStyleMismatch[];
  readonly withinTolerance: boolean;
};

export type GpuFlowVisualParityStyleMismatch = {
  readonly candidate: string;
  readonly property: GpuFlowVisualParityStyleProperty;
  readonly reference: string;
};

export type GpuFlowVisualParityScrollOffsetMismatch = {
  readonly candidate: GpuFlowVisualParityScrollOffset | null;
  readonly path: readonly number[];
  readonly reference: GpuFlowVisualParityScrollOffset | null;
};

export type GpuFlowActivationVisualParitySummary = {
  readonly deltas: readonly GpuFlowVisualParitySnapshotDelta[];
  readonly reference: GpuFlowVisualParitySnapshot;
};

type GpuFlowVisualParityElementCaptureInput = {
  readonly devicePixelRatio?: number | undefined;
  readonly expectedRect?: GpuFlowVisualParityRectInput | undefined;
  readonly nodeId: string;
  readonly performanceProbeKey?: string | undefined;
  readonly phase: GpuFlowVisualParityPhase;
  readonly texture?: GpuFlowVisualParityTextureMetadata | undefined;
  readonly timestampMs?: number | undefined;
  readonly uploadState?: GpuFlowVisualParityUploadState | undefined;
};

type GpuFlowVisualParityPageCaptureInput =
  GpuFlowVisualParityElementCaptureInput;

type CaptureGpuFlowVisualParityScreenshotRegionInput =
  GpuFlowVisualParityPageCaptureInput & {
    readonly path?: string | undefined;
    readonly region?: GpuFlowVisualParityScreenshotRegionOptions | undefined;
  };

type CompareGpuFlowVisualParitySnapshotsOptions = {
  readonly ignoredStyleProperties?:
    | readonly GpuFlowVisualParityStyleProperty[]
    | undefined;
  readonly rectToleranceCssPx?: number | undefined;
  readonly snappedRectToleranceCssPx?: number | undefined;
  readonly styleProperties?:
    | readonly GpuFlowVisualParityStyleProperty[]
    | undefined;
};

type SummarizeGpuFlowActivationVisualParityOptions =
  CompareGpuFlowVisualParitySnapshotsOptions & {
    readonly referencePhase?: GpuFlowVisualParityPhase | undefined;
  };

const GPU_FLOW_VISUAL_PARITY_STYLE_PROPERTIES = [
  "background-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "box-shadow",
  "box-sizing",
  "clip-path",
  "color",
  "contain",
  "filter",
  "font-family",
  "font-size",
  "font-smooth",
  "font-weight",
  "height",
  "left",
  "letter-spacing",
  "line-height",
  "opacity",
  "overflow",
  "overflow-x",
  "overflow-y",
  "pointer-events",
  "position",
  "text-rendering",
  "top",
  "transform",
  "transform-origin",
  "visibility",
  "width",
  "z-index",
  "-webkit-font-smoothing",
] as const;

const GPU_FLOW_VISUAL_PARITY_INLINE_PREFERRED_STYLE_PROPERTIES = [
  "height",
  "left",
  "pointer-events",
  "position",
  "top",
  "transform",
  "transform-origin",
  "width",
  "z-index",
] as const satisfies readonly GpuFlowVisualParityStyleProperty[];

const DEFAULT_PERFORMANCE_PROBE_KEY = "__settaGpuFlowPerformanceProbe";

export async function installGpuFlowVisualParityProbe(
  page: Page,
): Promise<void> {
  const initScript = createGpuFlowVisualParityProbeInitScript();
  await page.addInitScript({
    content: initScript,
  });
  await page.evaluate((script) => {
    window.eval(script);
  }, initScript);
}

export async function installGpuFlowVisualParityProbeForCurrentPage(
  page: Page,
): Promise<void> {
  await page.evaluate((script) => {
    window.eval(script);
  }, createGpuFlowVisualParityProbeInitScript());
}

export async function captureGpuFlowVisualParitySnapshot(
  page: Page,
  input: GpuFlowVisualParityPageCaptureInput,
): Promise<GpuFlowVisualParitySnapshot> {
  return page.evaluate(
    ({ input: pageInput, probeKey }) => {
      const api = (
        window as Window &
          Record<
            string,
            {
              capture(
                captureInput: GpuFlowVisualParityPageCaptureInput,
              ): GpuFlowVisualParitySnapshot;
            }
          >
      )[probeKey];
      if (!api) {
        throw new Error("Setta GPU flow visual parity probe is not installed.");
      }
      return api.capture(pageInput);
    },
    {
      input,
      probeKey: GPU_FLOW_VISUAL_PARITY_PROBE_KEY,
    },
  );
}

export async function captureGpuFlowVisualParityScreenshotRegion(
  page: Page,
  input: CaptureGpuFlowVisualParityScreenshotRegionInput,
): Promise<GpuFlowVisualParityScreenshotRegion> {
  const snapshot = await captureGpuFlowVisualParitySnapshot(page, input);
  const region = resolveGpuFlowVisualParityStableScreenshotRegion(
    snapshot.rect,
    input.region,
  );
  const screenshot = await page.screenshot({
    clip: region.clip,
    ...(input.path ? { path: input.path } : {}),
  });

  return {
    byteLength: screenshot.byteLength,
    clip: region.clip,
    nodeId: snapshot.nodeId,
    path: input.path ?? null,
    phase: snapshot.phase,
    regionId: region.regionId,
    sourceRect: snapshot.rect,
  };
}

export function createGpuFlowVisualParityProbeInitScript(): string {
  return [
    `const GPU_FLOW_VISUAL_PARITY_STYLE_PROPERTIES = ${JSON.stringify(
      GPU_FLOW_VISUAL_PARITY_STYLE_PROPERTIES,
    )};`,
    `const GPU_FLOW_VISUAL_PARITY_INLINE_PREFERRED_STYLE_PROPERTIES = ${JSON.stringify(
      GPU_FLOW_VISUAL_PARITY_INLINE_PREFERRED_STYLE_PROPERTIES,
    )};`,
    `const DEFAULT_PERFORMANCE_PROBE_KEY = ${JSON.stringify(
      DEFAULT_PERFORMANCE_PROBE_KEY,
    )};`,
    captureGpuFlowVisualParitySnapshotInPage.toString(),
    findGpuFlowNodeElement.toString(),
    rectInputToPlainObject.toString(),
    domRectToPlainObject.toString(),
    snapRectToDevicePixels.toString(),
    calculateRectDelta.toString(),
    maxAbs.toString(),
    captureStyleSnapshot.toString(),
    resolveVisualParityStyleValue.toString(),
    captureScrollOffsetSnapshot.toString(),
    collectScrollOffsetSnapshots.toString(),
    summarizeVisualParityUploadState.toString(),
    objectValue.toString(),
    arrayValue.toString(),
    numberOrNull.toString(),
    booleanOrNull.toString(),
    stringArray.toString(),
    normalizeTimestamp.toString(),
    `(${installGpuFlowVisualParityProbeInPage.toString()})();`,
  ].join("\n");
}

export function captureGpuFlowVisualParitySnapshotForElement(
  element: HTMLElement,
  input: GpuFlowVisualParityElementCaptureInput,
): GpuFlowVisualParitySnapshot {
  return captureGpuFlowVisualParitySnapshotInPage(element, input);
}

export function compareGpuFlowVisualParitySnapshots(
  reference: GpuFlowVisualParitySnapshot,
  candidate: GpuFlowVisualParitySnapshot,
  options: CompareGpuFlowVisualParitySnapshotsOptions = {},
): GpuFlowVisualParitySnapshotDelta {
  const maxRectDeltaCssPx = calculateRectDelta(
    reference.rect,
    candidate.rect,
  ).maxAbsCssPx;
  const maxSnappedRectDeltaCssPx = calculateRectDelta(
    reference.snappedRect,
    candidate.snappedRect,
  ).maxAbsCssPx;
  const styleMismatches = compareStyleSnapshots(reference, candidate, options);
  const scrollOffsetMismatches = compareScrollOffsetSnapshots(
    reference.scrollOffsets,
    candidate.scrollOffsets,
  );
  const rectToleranceCssPx = options.rectToleranceCssPx ?? 0.5;
  const snappedRectToleranceCssPx = options.snappedRectToleranceCssPx ?? 0.5;

  return {
    candidatePhase: candidate.phase,
    maxRectDeltaCssPx,
    maxSnappedRectDeltaCssPx,
    referencePhase: reference.phase,
    scrollOffsetMismatches,
    styleMismatches,
    withinTolerance:
      maxRectDeltaCssPx <= rectToleranceCssPx &&
      maxSnappedRectDeltaCssPx <= snappedRectToleranceCssPx &&
      styleMismatches.length === 0 &&
      scrollOffsetMismatches.length === 0,
  };
}

export function resolveGpuFlowVisualParityStableScreenshotRegion(
  rect: GpuFlowVisualParityRectInput,
  options: GpuFlowVisualParityScreenshotRegionOptions = {},
): Pick<GpuFlowVisualParityScreenshotRegion, "clip" | "regionId"> {
  const insets = normalizeScreenshotRegionInsets(options.insetCssPx ?? 8);
  const availableWidth = rect.width - insets.left - insets.right;
  const availableHeight = rect.height - insets.top - insets.bottom;
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error("GPU flow visual parity screenshot region has no area.");
  }

  const width = resolveScreenshotRegionDimension({
    available: availableWidth,
    axis: "width",
    max: options.maxWidthCssPx,
    min: options.minWidthCssPx,
  });
  const height = resolveScreenshotRegionDimension({
    available: availableHeight,
    axis: "height",
    max: options.maxHeightCssPx,
    min: options.minHeightCssPx,
  });
  return {
    clip: {
      height,
      width,
      x: rect.x + insets.left + (availableWidth - width) / 2,
      y: rect.y + insets.top + (availableHeight - height) / 2,
    },
    regionId: options.regionId ?? "stable-center",
  };
}

export function compareGpuFlowVisualParityPixelRegions(
  reference: GpuFlowVisualParityRgbaRegion,
  candidate: GpuFlowVisualParityRgbaRegion,
  options: GpuFlowVisualParityPixelDiffOptions = {},
): GpuFlowVisualParityPixelDiffSummary {
  validatePixelRegionPair(reference, candidate);
  const changedPixelChannelThreshold =
    options.changedPixelChannelThreshold ?? 0;
  const maxAllowedChannelDelta = options.maxChannelDelta ?? 0;
  const maxChangedPixelRatio = options.maxChangedPixelRatio ?? 0;
  const pixelCount = reference.width * reference.height;
  let changedPixelCount = 0;
  let maxChannelDelta = 0;
  let totalChannelDelta = 0;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    let maxPixelDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const channelDelta = Math.abs(
        candidate.data[offset + channel] - reference.data[offset + channel],
      );
      totalChannelDelta += channelDelta;
      maxChannelDelta = Math.max(maxChannelDelta, channelDelta);
      maxPixelDelta = Math.max(maxPixelDelta, channelDelta);
    }
    if (maxPixelDelta > changedPixelChannelThreshold) {
      changedPixelCount += 1;
    }
  }

  const changedPixelRatio = pixelCount === 0 ? 0 : changedPixelCount / pixelCount;
  return {
    changedPixelCount,
    changedPixelRatio,
    height: reference.height,
    maxChannelDelta,
    meanAbsoluteChannelDelta:
      pixelCount === 0 ? 0 : totalChannelDelta / (pixelCount * 4),
    pixelCount,
    width: reference.width,
    withinTolerance:
      maxChannelDelta <= maxAllowedChannelDelta &&
      changedPixelRatio <= maxChangedPixelRatio,
  };
}

export function summarizeGpuFlowActivationVisualParity(
  snapshots: readonly GpuFlowVisualParitySnapshot[],
  options: SummarizeGpuFlowActivationVisualParityOptions = {},
): GpuFlowActivationVisualParitySummary {
  const referencePhase = options.referencePhase ?? "passive-before";
  const reference = snapshots.find(
    (snapshot) => snapshot.phase === referencePhase,
  );
  if (!reference) {
    throw new Error(`Missing GPU flow visual parity reference ${referencePhase}.`);
  }
  return {
    deltas: snapshots
      .filter((snapshot) => snapshot !== reference)
      .map((snapshot) =>
        compareGpuFlowVisualParitySnapshots(reference, snapshot, options),
      ),
    reference,
  };
}

function compareStyleSnapshots(
  reference: GpuFlowVisualParitySnapshot,
  candidate: GpuFlowVisualParitySnapshot,
  options: CompareGpuFlowVisualParitySnapshotsOptions,
): GpuFlowVisualParityStyleMismatch[] {
  const ignored = new Set(options.ignoredStyleProperties ?? []);
  const properties =
    options.styleProperties ?? GPU_FLOW_VISUAL_PARITY_STYLE_PROPERTIES;
  const mismatches: GpuFlowVisualParityStyleMismatch[] = [];
  for (const property of properties) {
    if (ignored.has(property)) {
      continue;
    }
    const referenceValue = reference.style[property];
    const candidateValue = candidate.style[property];
    if (referenceValue !== candidateValue) {
      mismatches.push({
        candidate: candidateValue,
        property,
        reference: referenceValue,
      });
    }
  }
  return mismatches;
}

function compareScrollOffsetSnapshots(
  reference: readonly GpuFlowVisualParityScrollOffset[],
  candidate: readonly GpuFlowVisualParityScrollOffset[],
): GpuFlowVisualParityScrollOffsetMismatch[] {
  const referenceByPath = new Map(
    reference.map((offset) => [scrollOffsetPathKey(offset.path), offset]),
  );
  const candidateByPath = new Map(
    candidate.map((offset) => [scrollOffsetPathKey(offset.path), offset]),
  );
  const pathKeys = new Set([...referenceByPath.keys(), ...candidateByPath.keys()]);
  const mismatches: GpuFlowVisualParityScrollOffsetMismatch[] = [];

  for (const key of pathKeys) {
    const referenceOffset = referenceByPath.get(key) ?? null;
    const candidateOffset = candidateByPath.get(key) ?? null;
    if (
      referenceOffset?.scrollLeft === candidateOffset?.scrollLeft &&
      referenceOffset?.scrollTop === candidateOffset?.scrollTop
    ) {
      continue;
    }
    mismatches.push({
      candidate: candidateOffset,
      path: referenceOffset?.path ?? candidateOffset?.path ?? [],
      reference: referenceOffset,
    });
  }

  return mismatches;
}

function scrollOffsetPathKey(path: readonly number[]): string {
  return path.join(".");
}

function normalizeScreenshotRegionInsets(
  inset:
    | number
    | {
        readonly bottom?: number | undefined;
        readonly left?: number | undefined;
        readonly right?: number | undefined;
        readonly top?: number | undefined;
      },
): { readonly bottom: number; readonly left: number; readonly right: number; readonly top: number } {
  if (typeof inset === "number") {
    return {
      bottom: inset,
      left: inset,
      right: inset,
      top: inset,
    };
  }
  return {
    bottom: inset.bottom ?? 0,
    left: inset.left ?? 0,
    right: inset.right ?? 0,
    top: inset.top ?? 0,
  };
}

function resolveScreenshotRegionDimension({
  available,
  axis,
  max,
  min,
}: {
  readonly available: number;
  readonly axis: "height" | "width";
  readonly max: number | undefined;
  readonly min: number | undefined;
}): number {
  const dimension = Math.min(available, max ?? available);
  if (min !== undefined && dimension < min) {
    throw new Error(
      `GPU flow visual parity screenshot ${axis} ${dimension} is below minimum ${min}.`,
    );
  }
  return dimension;
}

function validatePixelRegionPair(
  reference: GpuFlowVisualParityRgbaRegion,
  candidate: GpuFlowVisualParityRgbaRegion,
) {
  if (
    reference.width !== candidate.width ||
    reference.height !== candidate.height
  ) {
    throw new Error(
      "GPU flow visual parity pixel regions must have matching dimensions.",
    );
  }
  const expectedLength = reference.width * reference.height * 4;
  if (
    reference.data.length !== expectedLength ||
    candidate.data.length !== expectedLength
  ) {
    throw new Error(
      "GPU flow visual parity pixel region data length does not match dimensions.",
    );
  }
}

function installGpuFlowVisualParityProbeInPage() {
  const probeKey = "__settaGpuFlowVisualParityProbe";
  const win = window as Window &
    typeof globalThis & {
      [probeKey]?: unknown;
    };
  const existing = win[probeKey] as { version?: number } | undefined;
  if (existing?.version === 1) {
    return;
  }

  win[probeKey] = {
    capture(input: GpuFlowVisualParityPageCaptureInput) {
      return captureGpuFlowVisualParitySnapshotInPage(
        findGpuFlowNodeElement(document, input.nodeId),
        input,
      );
    },
    uninstall() {
      delete win[probeKey];
    },
    version: 1,
  };
}

function captureGpuFlowVisualParitySnapshotInPage(
  element: HTMLElement,
  input: GpuFlowVisualParityElementCaptureInput,
): GpuFlowVisualParitySnapshot {
  const view = element.ownerDocument.defaultView ?? window;
  const devicePixelRatio = input.devicePixelRatio ?? view.devicePixelRatio ?? 1;
  const rect = domRectToPlainObject(element.getBoundingClientRect());
  const expectedRect = input.expectedRect
    ? rectInputToPlainObject(input.expectedRect)
    : null;
  const snappedRect = snapRectToDevicePixels(rect, devicePixelRatio);
  const expectedSnappedRect = expectedRect
    ? snapRectToDevicePixels(expectedRect, devicePixelRatio)
    : null;

  return {
    devicePixelRatio,
    expectedRect,
    expectedRectDelta: expectedRect
      ? calculateRectDelta(expectedRect, rect)
      : null,
    expectedSnappedRectDelta: expectedSnappedRect
      ? calculateRectDelta(expectedSnappedRect, snappedRect)
      : null,
    nodeId: input.nodeId,
    phase: input.phase,
    rect,
    scrollOffsets: captureScrollOffsetSnapshot(element),
    snappedRect,
    style: captureStyleSnapshot(element),
    texture: input.texture ?? null,
    timestampMs: normalizeTimestamp(input.timestampMs, view),
    uploadState:
      input.uploadState ??
      summarizeVisualParityUploadState({
        nodeId: input.nodeId,
        performanceProbeKey: input.performanceProbeKey,
        view,
      }),
  };
}

function findGpuFlowNodeElement(
  document: Document,
  nodeId: string,
): HTMLElement {
  for (const element of document.querySelectorAll<HTMLElement>(
    '[data-gpu-flow-node="true"]',
  )) {
    if (element.getAttribute("data-id") === nodeId) {
      return element;
    }
  }
  throw new Error(`GPU flow node ${nodeId} was not found.`);
}

function rectInputToPlainObject(
  rect: GpuFlowVisualParityRectInput,
): GpuFlowVisualParityRect {
  return {
    bottom: rect.y + rect.height,
    height: rect.height,
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

function domRectToPlainObject(rect: DOMRect): GpuFlowVisualParityRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

function snapRectToDevicePixels(
  rect: GpuFlowVisualParityRect,
  devicePixelRatio: number,
): GpuFlowVisualParityRect {
  const left = Math.round(rect.left * devicePixelRatio) / devicePixelRatio;
  const top = Math.round(rect.top * devicePixelRatio) / devicePixelRatio;
  const right = Math.round(rect.right * devicePixelRatio) / devicePixelRatio;
  const bottom = Math.round(rect.bottom * devicePixelRatio) / devicePixelRatio;
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
    x: left,
    y: top,
  };
}

function calculateRectDelta(
  reference: GpuFlowVisualParityRect,
  candidate: GpuFlowVisualParityRect,
): GpuFlowVisualParityRectDelta {
  const delta = {
    bottom: candidate.bottom - reference.bottom,
    height: candidate.height - reference.height,
    left: candidate.left - reference.left,
    right: candidate.right - reference.right,
    top: candidate.top - reference.top,
    width: candidate.width - reference.width,
    x: candidate.x - reference.x,
    y: candidate.y - reference.y,
  };
  return {
    ...delta,
    maxAbsCssPx: maxAbs([
      delta.bottom,
      delta.height,
      delta.left,
      delta.right,
      delta.top,
      delta.width,
      delta.x,
      delta.y,
    ]),
  };
}

function maxAbs(values: readonly number[]): number {
  return Math.max(...values.map((value) => Math.abs(value)));
}

function captureStyleSnapshot(
  element: HTMLElement,
): GpuFlowVisualParityStyleSnapshot {
  const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
  const snapshot: Record<string, string> = {};
  for (const property of GPU_FLOW_VISUAL_PARITY_STYLE_PROPERTIES) {
    snapshot[property] = resolveVisualParityStyleValue({
      computed,
      element,
      property,
    });
  }
  return snapshot as GpuFlowVisualParityStyleSnapshot;
}

function resolveVisualParityStyleValue({
  computed,
  element,
  property,
}: {
  readonly computed: CSSStyleDeclaration | undefined;
  readonly element: HTMLElement;
  readonly property: GpuFlowVisualParityStyleProperty;
}): string {
  const inlineValue = element.style.getPropertyValue(property);
  if (
    inlineValue &&
    GPU_FLOW_VISUAL_PARITY_INLINE_PREFERRED_STYLE_PROPERTIES.includes(property)
  ) {
    return inlineValue;
  }
  return computed?.getPropertyValue(property) ?? inlineValue;
}

function captureScrollOffsetSnapshot(
  root: HTMLElement,
): GpuFlowVisualParityScrollOffset[] {
  const snapshots: GpuFlowVisualParityScrollOffset[] = [];
  collectScrollOffsetSnapshots(root, [], snapshots);
  return snapshots;
}

function collectScrollOffsetSnapshots(
  element: Element,
  path: readonly number[],
  snapshots: GpuFlowVisualParityScrollOffset[],
) {
  if (element instanceof HTMLElement) {
    snapshots.push({
      path,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    });
  }
  const children = element.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children.item(index);
    if (child) {
      collectScrollOffsetSnapshots(child, [...path, index], snapshots);
    }
  }
}

function summarizeVisualParityUploadState({
  nodeId,
  performanceProbeKey,
  view,
}: {
  readonly nodeId: string;
  readonly performanceProbeKey?: string | undefined;
  readonly view: Window;
}): GpuFlowVisualParityUploadState | null {
  const probe = (
    view as Window &
      Record<string, { snapshot?: () => Record<string, unknown> }>
  )[performanceProbeKey ?? DEFAULT_PERFORMANCE_PROBE_KEY];
  const snapshot = probe?.snapshot?.();
  if (!snapshot) {
    return null;
  }

  const queueCalls = arrayValue(snapshot.queueCalls);
  let activeTextureUploadCountForNode = 0;
  let lastTextureUpload:
    | GpuFlowVisualParityUploadState["lastTextureUpload"]
    | null = null;
  let passiveTextureUploadCountForNode = 0;
  let textureUploadCountForNode = 0;

  for (const call of queueCalls) {
    const value = objectValue(call);
    if (
      value.method !== "copyElementImageToTexture" ||
      value.sourceNodeId !== nodeId
    ) {
      continue;
    }
    textureUploadCountForNode += 1;
    const sourceInteractive = booleanOrNull(value.sourceInteractive);
    if (sourceInteractive === true) {
      activeTextureUploadCountForNode += 1;
    } else if (sourceInteractive === false) {
      passiveTextureUploadCountForNode += 1;
    }
    lastTextureUpload = {
      height: numberOrNull(value.height),
      sourceInteractive,
      timestampMs: numberOrNull(value.timestampMs),
      width: numberOrNull(value.width),
    };
  }

  const nodeLayerFrames = arrayValue(snapshot.nodeLayerFrames);
  const latestNodeLayerFrame = objectValue(
    nodeLayerFrames[nodeLayerFrames.length - 1],
  );
  const latestUploadedNodeIds = stringArray(latestNodeLayerFrame.uploadedNodeIds);

  return {
    activeTextureUploadCountForNode,
    lastNodeLayerFrameUploadedNode:
      nodeLayerFrames.length === 0 ? null : latestUploadedNodeIds.includes(nodeId),
    lastTextureUpload,
    nodeLayerFrameCount: nodeLayerFrames.length,
    passiveTextureUploadCountForNode,
    textureUploadCountForNode,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeTimestamp(timestampMs: number | undefined, view: Window) {
  return timestampMs ?? view.performance.now();
}
