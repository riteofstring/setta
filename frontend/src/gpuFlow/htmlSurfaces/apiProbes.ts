import type {
  GpuQueueWithElementUpload,
  HtmlInCanvas2DContext,
  HtmlInCanvasCanvas,
  HtmlInCanvasPaintEvent,
} from "../htmlInCanvasTypes";

export type HtmlSurfaceApiProbeName =
  | "core-html-in-canvas-apis"
  | "copy-element-image-to-texture-overloads"
  | "direct-canvas-child-upload"
  | "css-transform-capture"
  | "css-transform-hit-testing"
  | "transform-only-paint-invalidation"
  | "overlapping-passive-source-capture"
  | "hidden-source-capture-policy"
  | "source-subrect-upload"
  | "get-element-transform"
  | "paint-changed-elements"
  | "draw-element-image-transform"
  | "capture-element-image-worker";

export type HtmlSurfaceApiProbeStatus = "fail" | "pass" | "unsupported";

export type HtmlSurfaceApiProbeRequirement = "documented" | "required";

export type HtmlSurfaceApiProbeResult = {
  readonly details?: string | undefined;
  readonly error?: string | undefined;
  readonly metrics?:
    | Readonly<Record<string, boolean | number | string>>
    | undefined;
  readonly name: HtmlSurfaceApiProbeName;
  readonly requirement: HtmlSurfaceApiProbeRequirement;
  readonly status: HtmlSurfaceApiProbeStatus;
};

export type HtmlSurfaceApiProbeSummary = {
  readonly failedRequiredProbeNames: readonly HtmlSurfaceApiProbeName[];
  readonly failedRequiredProbes: readonly HtmlSurfaceApiProbeResult[];
  readonly passCount: number;
  readonly results: readonly HtmlSurfaceApiProbeResult[];
  readonly unsupportedRequiredProbeNames: readonly HtmlSurfaceApiProbeName[];
};

export type HtmlSurfaceSourcePolicyIssue =
  | "not-direct-canvas-child"
  | "missing-layout-box"
  | "display-none"
  | "visibility-hidden"
  | "opacity-zero"
  | "parked-offscreen"
  | "clip-path-hidden";

export type HtmlSurfaceSourcePolicyResult = {
  readonly issues: readonly HtmlSurfaceSourcePolicyIssue[];
  readonly ok: boolean;
};

type ProbeFixture = {
  readonly canvas: HtmlInCanvasCanvas;
  readonly device: GPUDevice;
  readonly host: HTMLElement;
  readonly queue: GpuQueueWithElementUpload;
  readonly source: HTMLElement;
  createTexture(width: number, height: number): GPUTexture;
  destroy(): void;
};

type MutableProbeResult = {
  details?: string | undefined;
  error?: string | undefined;
  metrics?: Record<string, boolean | number | string> | undefined;
  name: HtmlSurfaceApiProbeName;
  requirement: HtmlSurfaceApiProbeRequirement;
  status: HtmlSurfaceApiProbeStatus;
};

export class HtmlSurfaceApiProbeError extends Error {
  readonly summary: HtmlSurfaceApiProbeSummary;

  constructor(summary: HtmlSurfaceApiProbeSummary) {
    super(formatHtmlSurfaceApiProbeError(summary));
    this.name = "HtmlSurfaceApiProbeError";
    this.summary = summary;
  }
}

export async function runHtmlSurfaceApiProbes(): Promise<HtmlSurfaceApiProbeSummary> {
  const results: HtmlSurfaceApiProbeResult[] = [];

  results.push(probeCoreApis());
  results.push(probeCaptureElementImageWorkerAvailability());

  await withProbeFixture(async (fixture) => {
    results.push(await probeCopyElementImageToTextureOverloads(fixture));
    results.push(await probeDirectCanvasChildUpload(fixture));
    results.push(await probeCssTransformCapture());
    results.push(probeCssTransformHitTesting(fixture));
    results.push(await probeTransformOnlyPaintInvalidation(fixture));
    results.push(await probeOverlappingPassiveSourceCapture(fixture));
    results.push(probeHiddenSourceCapturePolicy(fixture));
    results.push(await probeSourceSubrectUpload(fixture));
    results.push(probeGetElementTransform(fixture));
    results.push(await probePaintChangedElements(fixture));
    results.push(await probeDrawElementImageTransform());
  }, results);

  return summarizeHtmlSurfaceApiProbeResults(results);
}

export function summarizeHtmlSurfaceApiProbeResults(
  results: readonly HtmlSurfaceApiProbeResult[],
): HtmlSurfaceApiProbeSummary {
  const failedRequiredProbes = results.filter(
    (result) => result.requirement === "required" && result.status !== "pass",
  );
  return {
    failedRequiredProbeNames: failedRequiredProbes
      .filter((result) => result.status === "fail")
      .map((result) => result.name),
    failedRequiredProbes,
    passCount: results.filter((result) => result.status === "pass").length,
    results,
    unsupportedRequiredProbeNames: failedRequiredProbes
      .filter((result) => result.status === "unsupported")
      .map((result) => result.name),
  };
}

export function assertHtmlSurfaceApiProbesPassed(
  summary: HtmlSurfaceApiProbeSummary,
) {
  if (summary.failedRequiredProbes.length > 0) {
    throw new HtmlSurfaceApiProbeError(summary);
  }
}

export function evaluateHtmlSurfaceSourcePolicy(
  canvas: HTMLCanvasElement,
  source: HTMLElement,
): HtmlSurfaceSourcePolicyResult {
  const issues: HtmlSurfaceSourcePolicyIssue[] = [];
  appendDirectChildPolicyIssues(issues, canvas, source);
  appendStylePolicyIssues(issues, source);
  appendBoxPolicyIssues(issues, source);

  return {
    issues,
    ok: issues.length === 0,
  };
}

function probeCoreApis(): HtmlSurfaceApiProbeResult {
  const metrics = collectCoreApiMetrics();
  const missing = missingCoreApiNames(metrics);
  if (missing.length > 0) {
    return fail("core-html-in-canvas-apis", "required", {
      details: `Missing required APIs: ${missing.join(", ")}.`,
      metrics,
      status: "unsupported",
    });
  }
  return pass("core-html-in-canvas-apis", "required", {
    details: "Required html-in-canvas and WebGPU entrypoints are present.",
    metrics,
  });
}

function appendDirectChildPolicyIssues(
  issues: HtmlSurfaceSourcePolicyIssue[],
  canvas: HTMLCanvasElement,
  source: HTMLElement,
) {
  if (source.parentElement !== canvas) {
    issues.push("not-direct-canvas-child");
  }
}

function appendStylePolicyIssues(
  issues: HtmlSurfaceSourcePolicyIssue[],
  source: HTMLElement,
) {
  const style = globalThis.getComputedStyle?.(source);
  const checks: readonly [HtmlSurfaceSourcePolicyIssue, boolean][] = [
    ["display-none", style?.display === "none"],
    ["visibility-hidden", style?.visibility === "hidden"],
    ["opacity-zero", style?.opacity.trim() === "0"],
    ["clip-path-hidden", Boolean(style?.clipPath && style.clipPath !== "none")],
  ];
  for (const [issue, applies] of checks) {
    if (applies) {
      issues.push(issue);
    }
  }
}

function appendBoxPolicyIssues(
  issues: HtmlSurfaceSourcePolicyIssue[],
  source: HTMLElement,
) {
  const rect = source.getBoundingClientRect();
  if (sourceHasNoLayoutBox(source, rect)) {
    issues.push("missing-layout-box");
  }
  if (isParkedOffscreen(source, rect)) {
    issues.push("parked-offscreen");
  }
}

function sourceHasNoLayoutBox(source: HTMLElement, rect: DOMRect): boolean {
  return (
    rect.width <= 0 || rect.height <= 0 || source.getClientRects().length === 0
  );
}

function isParkedOffscreen(source: HTMLElement, rect: DOMRect): boolean {
  const style = globalThis.getComputedStyle?.(source);
  const left = Number.parseFloat(style?.left ?? "");
  const top = Number.parseFloat(style?.top ?? "");
  return rect.right < 0 || rect.bottom < 0 || left <= -1_000 || top <= -1_000;
}

function collectCoreApiMetrics(): Record<string, boolean> {
  return {
    copyElementImageToTexture: hasGpuQueueElementUpload(),
    drawElementImage: hasDrawElementImageApi(),
    getElementTransform: hasCanvasMethod("getElementTransform"),
    layoutSubtree: hasCanvasProperty("layoutSubtree"),
    navigatorGpu: Boolean(globalThis.navigator?.gpu),
    onpaint: hasCanvasProperty("onpaint"),
    requestPaint: hasCanvasMethod("requestPaint"),
  };
}

function missingCoreApiNames(metrics: Record<string, boolean>): string[] {
  return Object.entries(metrics)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function hasGpuQueueElementUpload(): boolean {
  const gpuQueuePrototype = (
    globalThis as typeof globalThis & {
      GPUQueue?: { prototype?: GpuQueueWithElementUpload | undefined };
    }
  ).GPUQueue?.prototype;
  return typeof gpuQueuePrototype?.copyElementImageToTexture === "function";
}

function hasDrawElementImageApi(): boolean {
  const contextPrototype = globalThis.CanvasRenderingContext2D?.prototype as
    | HtmlInCanvas2DContext
    | undefined;
  return typeof contextPrototype?.drawElementImage === "function";
}

function hasCanvasMethod(method: keyof HtmlInCanvasCanvas): boolean {
  const { instance, prototype } = getCanvasApiTargets();
  return (
    typeof instance?.[method] === "function" ||
    typeof prototype?.[method] === "function"
  );
}

function hasCanvasProperty(property: keyof HtmlInCanvasCanvas): boolean {
  const { instance, prototype } = getCanvasApiTargets();
  return property in (instance ?? prototype ?? {});
}

function getCanvasApiTargets(): {
  readonly instance: Partial<HtmlInCanvasCanvas> | undefined;
  readonly prototype: Partial<HtmlInCanvasCanvas> | undefined;
} {
  return {
    instance: globalThis.document?.createElement("canvas") as
      | Partial<HtmlInCanvasCanvas>
      | undefined,
    prototype: globalThis.HTMLCanvasElement?.prototype as
      | Partial<HtmlInCanvasCanvas>
      | undefined,
  };
}

async function withProbeFixture(
  callback: (fixture: ProbeFixture) => Promise<void>,
  results: HtmlSurfaceApiProbeResult[],
) {
  let fixture: ProbeFixture | null = null;
  try {
    fixture = await createProbeFixture();
    await callback(fixture);
  } catch (error) {
    results.push(
      fail("direct-canvas-child-upload", "required", {
        error: stringifyError(error),
        status: "fail",
      }),
    );
  } finally {
    fixture?.destroy();
  }
}

async function createProbeFixture(): Promise<ProbeFixture> {
  const document = globalThis.document;
  if (!document) {
    throw new Error("Setta HTML surface probes require a document.");
  }
  const gpu = globalThis.navigator?.gpu;
  if (!gpu) {
    throw new Error("Setta HTML surface probes require navigator.gpu.");
  }

  const host = document.createElement("div");
  host.style.cssText = [
    "background: transparent",
    "height: 160px",
    "left: 8px",
    "overflow: hidden",
    "pointer-events: auto",
    "position: fixed",
    "top: 8px",
    "width: 220px",
    "z-index: 2147483647",
  ].join(";");

  const canvas = document.createElement("canvas") as HtmlInCanvasCanvas;
  canvas.width = 160;
  canvas.height = 120;
  canvas.layoutSubtree = true;
  canvas.setAttribute("layoutsubtree", "");
  canvas.style.cssText = [
    "height: 120px",
    "left: 0",
    "position: absolute",
    "top: 0",
    "width: 160px",
  ].join(";");

  const source = document.createElement("button");
  source.type = "button";
  source.textContent = "Setta probe";
  source.style.cssText = [
    "background: rgb(24, 146, 72)",
    "border: 0",
    "box-sizing: border-box",
    "color: white",
    "contain: layout paint style",
    "height: 48px",
    "left: 0",
    "pointer-events: none",
    "position: absolute",
    "top: 0",
    "transform-origin: 0 0",
    "width: 96px",
  ].join(";");

  canvas.append(source);
  host.append(canvas);
  document.body.append(host);

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error(
      "Setta HTML surface probes could not acquire a GPU adapter.",
    );
  }
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) {
    device.destroy();
    throw new Error(
      "Setta HTML surface probes require a WebGPU canvas context.",
    );
  }
  context.configure({
    alphaMode: "premultiplied",
    device,
    format: gpu.getPreferredCanvasFormat(),
  });
  await nextAnimationFrame();

  return {
    canvas,
    device,
    host,
    queue: device.queue as GpuQueueWithElementUpload,
    source,
    createTexture(width: number, height: number) {
      return device.createTexture({
        format: "rgba8unorm",
        label: "setta-html-surface-api-probe-texture",
        size: { height, width },
        usage: textureUploadUsage(),
      });
    },
    destroy() {
      host.remove();
      device.destroy();
    },
  };
}

async function probeCopyElementImageToTextureOverloads(
  fixture: ProbeFixture,
): Promise<HtmlSurfaceApiProbeResult> {
  const method = fixture.queue.copyElementImageToTexture;
  if (typeof method !== "function") {
    return fail("copy-element-image-to-texture-overloads", "required", {
      details: "GPUQueue.copyElementImageToTexture is not available.",
      status: "unsupported",
    });
  }
  const texture = fixture.createTexture(96, 48);
  const upload = method.bind(fixture.queue) as NonNullable<
    GpuQueueWithElementUpload["copyElementImageToTexture"]
  >;
  try {
    upload(fixture.source, 96, 48, { texture });
    upload(fixture.source, { texture });
    return pass("copy-element-image-to-texture-overloads", "required", {
      details: "Base destination and destination-size overloads are callable.",
      metrics: {
        functionLength: method.length,
      },
    });
  } catch (error) {
    return fail("copy-element-image-to-texture-overloads", "required", {
      error: stringifyError(error),
    });
  } finally {
    texture.destroy?.();
  }
}

async function probeDirectCanvasChildUpload(
  fixture: ProbeFixture,
): Promise<HtmlSurfaceApiProbeResult> {
  const texture = fixture.createTexture(96, 48);
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "height: 48px; left: 0; position: absolute; top: 60px; width: 96px;";
  const nested = document.createElement("button");
  nested.type = "button";
  nested.textContent = "Nested";
  nested.style.cssText = "height: 48px; width: 96px;";
  wrapper.append(nested);
  fixture.canvas.append(wrapper);
  await nextAnimationFrame();

  try {
    fixture.queue.copyElementImageToTexture?.(fixture.source, 96, 48, {
      texture,
    });
    let nestedUploadFailed = false;
    let nestedUploadError = "";
    try {
      fixture.queue.copyElementImageToTexture?.(nested, 96, 48, { texture });
    } catch (error) {
      nestedUploadFailed = true;
      nestedUploadError = stringifyError(error);
    }
    if (!nestedUploadFailed) {
      return fail("direct-canvas-child-upload", "required", {
        details:
          "Nested element upload unexpectedly succeeded; direct-child assumptions must be re-audited.",
      });
    }
    return pass("direct-canvas-child-upload", "required", {
      details: "Direct child upload succeeds and nested upload fails loudly.",
      metrics: {
        nestedUploadError,
      },
    });
  } catch (error) {
    return fail("direct-canvas-child-upload", "required", {
      error: stringifyError(error),
    });
  } finally {
    wrapper.remove();
    texture.destroy?.();
  }
}

async function probeCssTransformCapture(): Promise<HtmlSurfaceApiProbeResult> {
  const fixture = createDrawElementImageFixture();
  if (!fixture) {
    return fail("css-transform-capture", "required", {
      details: "CanvasRenderingContext2D.drawElementImage is unavailable.",
      status: "unsupported",
    });
  }
  const { canvas, context, host, source } = fixture;
  try {
    source.style.transform = "translate(80px, 0)";
    await nextAnimationFrame();
    await drawElementImageDuringPaint(fixture, () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawElementImage?.(source, 0, 0, 32, 32);
    });
    const localPixel = context.getImageData(8, 8, 1, 1).data;
    const translatedPixel = context.getImageData(88, 8, 1, 1).data;
    const localCaptured = isCapturedPixel(localPixel);
    const translatedCaptured = isCapturedPixel(translatedPixel);
    if (!localCaptured || translatedCaptured) {
      return fail("css-transform-capture", "required", {
        details:
          "CSS transform affected capture pixels; source movement would alter uploaded texture content.",
        metrics: {
          localCaptured,
          translatedCaptured,
        },
      });
    }
    return pass("css-transform-capture", "required", {
      details: "CSS transforms are ignored by drawElementImage capture.",
      metrics: {
        localCaptured,
        translatedCaptured,
      },
    });
  } catch (error) {
    return fail("css-transform-capture", "required", {
      error: stringifyError(error),
    });
  } finally {
    host.remove();
  }
}

function probeCssTransformHitTesting(
  fixture: ProbeFixture,
): HtmlSurfaceApiProbeResult {
  fixture.source.style.pointerEvents = "auto";
  fixture.source.style.transform = "translate(48px, 32px)";
  const rect = fixture.source.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + 8, rect.top + 8);
  fixture.source.style.transform = "";
  fixture.source.style.pointerEvents = "none";
  if (hit !== fixture.source && (!hit || !fixture.source.contains(hit))) {
    return fail("css-transform-hit-testing", "required", {
      details: "CSS-transformed source was not the browser hit target.",
      metrics: {
        hitTag: hit?.tagName ?? "null",
      },
    });
  }
  return pass("css-transform-hit-testing", "required", {
    details: "CSS transforms affect native hit testing.",
  });
}

async function probeTransformOnlyPaintInvalidation(
  fixture: ProbeFixture,
): Promise<HtmlSurfaceApiProbeResult> {
  let paintCount = 0;
  const onPaint = () => {
    paintCount += 1;
  };
  fixture.canvas.addEventListener("paint", onPaint);
  try {
    await requestPaintAndWait(fixture.canvas);
    await nextAnimationFrame();
    await nextAnimationFrame();
    paintCount = 0;
    fixture.source.style.transform = "translate(12px, 12px)";
    await nextAnimationFrame();
    await nextAnimationFrame();
    fixture.source.style.transform = "";
    if (paintCount !== 0) {
      return pass("transform-only-paint-invalidation", "documented", {
        details:
          "Transform-only source movement fired paint; Setta routes expected direct-source transform paints away from texture dirtying.",
        metrics: { paintCount },
      });
    }
    return pass("transform-only-paint-invalidation", "documented", {
      details: "Transform-only source movement did not fire paint.",
      metrics: { paintCount },
    });
  } finally {
    fixture.canvas.removeEventListener("paint", onPaint);
  }
}

async function probeOverlappingPassiveSourceCapture(
  fixture: ProbeFixture,
): Promise<HtmlSurfaceApiProbeResult> {
  const texture = fixture.createTexture(96, 48);
  const overlay = document.createElement("div");
  overlay.textContent = "Overlap";
  overlay.style.cssText = [
    "background: rgb(10, 80, 180)",
    "height: 48px",
    "left: 0",
    "pointer-events: none",
    "position: absolute",
    "top: 0",
    "width: 96px",
  ].join(";");
  fixture.canvas.append(overlay);
  await nextAnimationFrame();
  try {
    fixture.queue.copyElementImageToTexture?.(overlay, 96, 48, { texture });
    return pass("overlapping-passive-source-capture", "required", {
      details:
        "Overlapping direct child with pointer-events none remains uploadable.",
    });
  } catch (error) {
    return fail("overlapping-passive-source-capture", "required", {
      error: stringifyError(error),
    });
  } finally {
    overlay.remove();
    texture.destroy?.();
  }
}

function probeHiddenSourceCapturePolicy(
  fixture: ProbeFixture,
): HtmlSurfaceApiProbeResult {
  const source = fixture.source;
  const original = source.getAttribute("style") ?? "";
  const checks: Record<string, string> = {
    "clip-path": "clip-path: inset(0 0 100% 0)",
    "display-none": "display: none",
    "left-offscreen": "left: -9999px",
    "opacity-zero": "opacity: 0",
    "visibility-hidden": "visibility: hidden",
  };
  const issueCounts: Record<string, number> = {};
  try {
    for (const [label, styleText] of Object.entries(checks)) {
      source.setAttribute("style", `${original}; ${styleText};`);
      issueCounts[label] = evaluateHtmlSurfaceSourcePolicy(
        fixture.canvas,
        source,
      ).issues.length;
    }
  } finally {
    source.setAttribute("style", original);
  }
  const missingPolicy = Object.entries(issueCounts)
    .filter(([, count]) => count === 0)
    .map(([label]) => label);
  if (missingPolicy.length > 0) {
    return fail("hidden-source-capture-policy", "required", {
      details: `Hidden source policies did not flag: ${missingPolicy.join(", ")}.`,
      metrics: issueCounts,
    });
  }
  return pass("hidden-source-capture-policy", "required", {
    details: "Forbidden hidden-source styles are rejected by source policy.",
    metrics: issueCounts,
  });
}

async function probeSourceSubrectUpload(
  fixture: ProbeFixture,
): Promise<HtmlSurfaceApiProbeResult> {
  const texture = fixture.createTexture(16, 16);
  const subrectQueue = fixture.queue as GpuQueueWithElementUpload & {
    copyElementImageToTexture?: (...args: unknown[]) => void;
  };
  try {
    subrectQueue.copyElementImageToTexture?.(fixture.source, 0, 0, 16, 16, {
      texture,
    });
    return pass("source-subrect-upload", "required", {
      details: "Source-subrect overload is callable.",
    });
  } catch (error) {
    return fail("source-subrect-upload", "required", {
      details:
        "Source-subrect overload failed; tiling work must choose full-tile recapture or source-owned tiles.",
      error: stringifyError(error),
    });
  } finally {
    texture.destroy?.();
  }
}

function probeGetElementTransform(
  fixture: ProbeFixture,
): HtmlSurfaceApiProbeResult {
  if (typeof fixture.canvas.getElementTransform !== "function") {
    return fail("get-element-transform", "required", {
      details: "HTMLCanvasElement.getElementTransform is unavailable.",
      status: "unsupported",
    });
  }
  try {
    const transform = fixture.canvas.getElementTransform(
      fixture.source,
      new DOMMatrix().translate(10, 20),
    );
    return pass("get-element-transform", "required", {
      details: "getElementTransform returned a DOMMatrix.",
      metrics: {
        a: transform.a,
        d: transform.d,
        e: transform.e,
        f: transform.f,
      },
    });
  } catch (error) {
    return fail("get-element-transform", "required", {
      error: stringifyError(error),
    });
  }
}

async function probePaintChangedElements(
  fixture: ProbeFixture,
): Promise<HtmlSurfaceApiProbeResult> {
  const changedElements: Element[] = [];
  const onPaint = (event: Event) => {
    changedElements.push(
      ...(((event as HtmlInCanvasPaintEvent).changedElements ??
        []) as Element[]),
    );
  };
  fixture.canvas.addEventListener("paint", onPaint);
  try {
    fixture.source.textContent = `Setta probe ${Date.now()}`;
    await requestPaintAndWait(fixture.canvas);
    const matched = changedElements.some(
      (element) =>
        element === fixture.source || element.contains(fixture.source),
    );
    if (!matched) {
      return fail("paint-changed-elements", "required", {
        details:
          "paint.changedElements did not identify the changed source or an owning subtree.",
        metrics: {
          changedElementCount: changedElements.length,
        },
      });
    }
    return pass("paint-changed-elements", "required", {
      details: "paint.changedElements can identify the dirty source owner.",
      metrics: {
        changedElementCount: changedElements.length,
      },
    });
  } finally {
    fixture.canvas.removeEventListener("paint", onPaint);
  }
}

async function probeDrawElementImageTransform(): Promise<HtmlSurfaceApiProbeResult> {
  const fixture = createDrawElementImageFixture();
  if (!fixture) {
    return fail("draw-element-image-transform", "required", {
      details: "CanvasRenderingContext2D.drawElementImage is unavailable.",
      status: "unsupported",
    });
  }
  const { context, host, source } = fixture;
  try {
    const transform = await drawElementImageDuringPaint(fixture, () =>
      context.drawElementImage?.(source, 12, 14, 32, 32),
    );
    if (!(transform instanceof DOMMatrix)) {
      return fail("draw-element-image-transform", "required", {
        details: "drawElementImage did not return a DOMMatrix.",
        metrics: {
          returnedType: typeof transform,
        },
      });
    }
    return pass("draw-element-image-transform", "required", {
      details: "drawElementImage returned a source alignment transform.",
      metrics: {
        a: transform.a,
        d: transform.d,
        e: transform.e,
        f: transform.f,
      },
    });
  } catch (error) {
    return fail("draw-element-image-transform", "required", {
      error: stringifyError(error),
    });
  } finally {
    host.remove();
  }
}

function probeCaptureElementImageWorkerAvailability(): HtmlSurfaceApiProbeResult {
  const canvasPrototype = globalThis.HTMLCanvasElement?.prototype as
    | (HTMLCanvasElement & {
        captureElementImage?: unknown;
        transferControlToOffscreen?: unknown;
      })
    | undefined;
  const metrics = {
    captureElementImage:
      typeof canvasPrototype?.captureElementImage === "function",
    offscreenCanvas: typeof globalThis.OffscreenCanvas === "function",
    transferControlToOffscreen:
      typeof canvasPrototype?.transferControlToOffscreen === "function",
  };
  return pass("capture-element-image-worker", "documented", {
    details:
      metrics.captureElementImage && metrics.offscreenCanvas
        ? "Worker-oriented capture APIs are available but not required by the initial replacement."
        : "Worker-oriented capture APIs are unavailable or incomplete; the initial replacement must stay on the main-thread direct upload path.",
    metrics,
  });
}

function createDrawElementImageFixture(): {
  readonly canvas: HtmlInCanvasCanvas;
  readonly context: HtmlInCanvas2DContext;
  readonly host: HTMLElement;
  readonly source: HTMLElement;
} | null {
  const contextPrototype = globalThis.CanvasRenderingContext2D?.prototype as
    | HtmlInCanvas2DContext
    | undefined;
  if (typeof contextPrototype?.drawElementImage !== "function") {
    return null;
  }
  const host = document.createElement("div");
  host.style.cssText = [
    "height: 120px",
    "left: 244px",
    "overflow: hidden",
    "position: fixed",
    "top: 8px",
    "width: 160px",
    "z-index: 2147483647",
  ].join(";");
  const canvas = document.createElement("canvas") as HtmlInCanvasCanvas;
  canvas.width = 120;
  canvas.height = 80;
  canvas.layoutSubtree = true;
  canvas.setAttribute("layoutsubtree", "");
  canvas.style.cssText = "height: 80px; width: 120px;";
  const source = document.createElement("div");
  source.textContent = "Capture";
  source.style.cssText = [
    "background: rgb(24, 146, 72)",
    "box-sizing: border-box",
    "color: white",
    "height: 32px",
    "left: 0",
    "position: absolute",
    "top: 0",
    "width: 32px",
  ].join(";");
  canvas.append(source);
  host.append(canvas);
  document.body.append(host);
  const context = canvas.getContext("2d") as HtmlInCanvas2DContext | null;
  if (!context) {
    host.remove();
    return null;
  }
  return { canvas, context, host, source };
}

function drawElementImageDuringPaint<T>(
  fixture: {
    readonly canvas: HtmlInCanvasCanvas;
    readonly context: HtmlInCanvas2DContext;
  },
  draw: () => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      fixture.canvas.removeEventListener("paint", onPaint);
      reject(
        new Error("Timed out waiting to draw during html-in-canvas paint."),
      );
    }, 1_000);
    const onPaint = () => {
      globalThis.clearTimeout(timeout);
      fixture.canvas.removeEventListener("paint", onPaint);
      try {
        resolve(draw());
      } catch (error) {
        reject(error);
      }
    };
    fixture.canvas.addEventListener("paint", onPaint);
    fixture.canvas.requestPaint();
  });
}

function requestPaintAndWait(canvas: HtmlInCanvasCanvas): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      canvas.removeEventListener("paint", onPaint);
      reject(new Error("Timed out waiting for html-in-canvas paint event."));
    }, 1_000);
    const onPaint = () => {
      globalThis.clearTimeout(timeout);
      canvas.removeEventListener("paint", onPaint);
      resolve();
    };
    canvas.addEventListener("paint", onPaint);
    canvas.requestPaint();
  });
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.requestAnimationFrame(() => {
      resolve();
    });
  });
}

function textureUploadUsage(): GPUTextureUsageFlags {
  const usage = globalThis.GPUTextureUsage;
  if (!usage) {
    throw new Error("Setta HTML surface probes require GPUTextureUsage.");
  }
  return usage.TEXTURE_BINDING | usage.COPY_DST | usage.RENDER_ATTACHMENT;
}

function isCapturedPixel(data: Uint8ClampedArray): boolean {
  return (data[3] ?? 0) > 200;
}

function pass(
  name: HtmlSurfaceApiProbeName,
  requirement: HtmlSurfaceApiProbeRequirement,
  result: Omit<MutableProbeResult, "name" | "requirement" | "status"> = {},
): HtmlSurfaceApiProbeResult {
  return {
    ...result,
    name,
    requirement,
    status: "pass",
  };
}

function fail(
  name: HtmlSurfaceApiProbeName,
  requirement: HtmlSurfaceApiProbeRequirement,
  result: Omit<MutableProbeResult, "name" | "requirement" | "status"> & {
    readonly status?: HtmlSurfaceApiProbeStatus | undefined;
  } = {},
): HtmlSurfaceApiProbeResult {
  const { status, ...rest } = result;
  return {
    ...rest,
    name,
    requirement,
    status: status ?? "fail",
  };
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatHtmlSurfaceApiProbeError(
  summary: HtmlSurfaceApiProbeSummary,
): string {
  const probeNames = summary.failedRequiredProbes
    .map(
      (result) =>
        `${result.name}: ${result.error ?? result.details ?? result.status}`,
    )
    .join("; ");
  return `Setta HTML surface required browser probes failed: ${probeNames}`;
}
