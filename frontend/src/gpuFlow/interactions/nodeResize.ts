import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "../animationFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuNodeLayout } from "../htmlSurfaces/frame";
import {
  GPU_NODE_RESIZE_DIRECTIONS,
  resolveGpuNodeResizeTargetFromEventTarget,
  type GpuNodeResizeDirection,
  type GpuNodeResizeTarget,
} from "../resizeHandles";
import { normalizeGpuViewport, type GpuPoint } from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";

export type GpuNodeResizePhase = "start" | "resize" | "stop" | "cancel";

export type GpuNodeResizePolicy = {
  readonly aspectRatio?: boolean | undefined;
  readonly aspectRatioExtraHeight?: number | undefined;
  readonly aspectRatioExtraWidth?: number | undefined;
  readonly directions?: readonly GpuNodeResizeDirection[] | undefined;
  readonly enabled?: boolean | undefined;
  readonly maxHeight?: number | undefined;
  readonly maxWidth?: number | undefined;
  readonly minHeight?: number | undefined;
  readonly minWidth?: number | undefined;
  readonly snapGrid?: readonly [number, number] | undefined;
  readonly snapToGrid?: boolean | (() => boolean) | undefined;
};

export type GpuNodeResizePolicyInput = {
  readonly direction: GpuNodeResizeDirection;
  readonly node: GpuNodeLayout;
  readonly nodeId: string;
  readonly targetElement?: HTMLElement | undefined;
};

export type GpuNodeResizeChange = {
  readonly active: boolean;
  readonly direction: GpuNodeResizeDirection;
  readonly layout: GpuNodeLayout;
  readonly nodeId: string;
  readonly phase: GpuNodeResizePhase;
  readonly pointerDelta: GpuPoint;
  readonly sizeDelta: {
    readonly height: number;
    readonly width: number;
  };
  readonly startLayout: GpuNodeLayout;
  readonly totalSizeDelta: {
    readonly height: number;
    readonly width: number;
  };
};

export type GpuNodeResizeControllerOptions = {
  readonly cancelAnimationFrame?: ((handle: number) => void) | undefined;
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly element: HTMLElement;
  readonly getNodes: () => readonly GpuNodeLayout[];
  readonly getResizePolicy?:
    | ((
        input: GpuNodeResizePolicyInput,
      ) => GpuNodeResizePolicy | false | null | undefined)
    | undefined;
  readonly onNodeResize?: ((change: GpuNodeResizeChange) => void) | undefined;
  readonly onNodeResizeCancel?:
    | ((change: GpuNodeResizeChange) => void)
    | undefined;
  readonly onNodeResizeStart?:
    | ((change: GpuNodeResizeChange) => void)
    | undefined;
  readonly onNodeResizeStop?:
    | ((change: GpuNodeResizeChange) => void)
    | undefined;
  readonly requestAnimationFrame?:
    | ((callback: FrameRequestCallback) => number)
    | undefined;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
  readonly resolveResizeTarget?:
    | ((event: PointerEvent) => GpuNodeResizeTarget | null)
    | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type ActiveGpuNodeResize = {
  readonly captureElement: HTMLElement;
  readonly direction: GpuNodeResizeDirection;
  readonly nodeId: string;
  readonly pointerId: number;
  readonly policy: ResolvedGpuNodeResizePolicy;
  readonly startLayout: NumericGpuNodeLayout;
  readonly startScreenPoint: GpuPoint;
  frameHandle: number | null;
  lastLayout: NumericGpuNodeLayout;
  lastScreenPoint: GpuPoint;
};

type GpuNodeResizeStart = {
  readonly policy: ResolvedGpuNodeResizePolicy;
  readonly startLayout: NumericGpuNodeLayout;
  readonly target: GpuNodeResizeTarget;
};

type NumericGpuNodeLayout = GpuNodeLayout & {
  readonly height: number;
  readonly width: number;
};

type ResolvedGpuNodeResizePolicy = {
  readonly aspectRatio: boolean;
  readonly aspectRatioExtraHeight: number;
  readonly aspectRatioExtraWidth: number;
  readonly directions: ReadonlySet<GpuNodeResizeDirection>;
  readonly maxHeight: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly minWidth: number;
  readonly snapGrid?: readonly [number, number] | undefined;
  readonly snapToGrid: boolean;
};

type ResolvedGpuNodeResizeConstraints = Pick<
  ResolvedGpuNodeResizePolicy,
  "maxHeight" | "maxWidth" | "minHeight" | "minWidth"
>;

type ResolvedGpuNodeResizeSnapPolicy = Pick<
  ResolvedGpuNodeResizePolicy,
  "snapGrid" | "snapToGrid"
>;

type GpuNodeResizeSize = {
  readonly height: number;
  readonly width: number;
};

const DEFAULT_RESIZE_DIRECTIONS = new Set<GpuNodeResizeDirection>(
  GPU_NODE_RESIZE_DIRECTIONS,
);

const ZERO_POINT: GpuPoint = { x: 0, y: 0 };

export function attachGpuNodeResizeController(
  options: GpuNodeResizeControllerOptions,
): () => void {
  const controller = new GpuNodeResizeController(options);
  controller.attach();
  return () => controller.destroy();
}

export function resizeGpuNodeLayout({
  direction,
  pointerDelta,
  policy,
  startLayout,
}: {
  readonly direction: GpuNodeResizeDirection;
  readonly pointerDelta: GpuPoint;
  readonly policy?: GpuNodeResizePolicy | undefined;
  readonly startLayout: NumericGpuNodeLayout;
}): NumericGpuNodeLayout {
  const resolvedPolicy = resolveGpuNodeResizePolicy(policy);
  const requestedSize = getRequestedGpuNodeResizeSize({
    direction,
    pointerDelta,
    startLayout,
  });

  if (resolvedPolicy.aspectRatio) {
    return resizeGpuNodeWithAspectRatio({
      direction,
      pointerDelta,
      policy: resolvedPolicy,
      requestedSize,
      startLayout,
    });
  }

  return createGpuNodeResizeLayout(
    startLayout,
    clampGpuNodeResizeSize(
      snapGpuNodeResizeSize({
        direction,
        policy: resolvedPolicy,
        size: requestedSize,
      }),
      resolvedPolicy,
    ),
  );
}

class GpuNodeResizeController {
  private activeResize: ActiveGpuNodeResize | null = null;
  private readonly cancelAnimationFrame: (handle: number) => void;
  private readonly element: HTMLElement;
  private readonly options: Omit<
    GpuNodeResizeControllerOptions,
    "cancelAnimationFrame" | "element" | "requestAnimationFrame" | "store"
  >;
  private readonly requestAnimationFrame: (
    callback: FrameRequestCallback,
  ) => number;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuNodeResizeControllerOptions) {
    this.cancelAnimationFrame =
      options.cancelAnimationFrame ?? cancelGpuAnimationFrame;
    this.element = options.element;
    this.options = options;
    this.requestAnimationFrame =
      options.requestAnimationFrame ?? requestGpuAnimationFrame;
    this.store = options.store ?? gpuFlowViewportStore;
  }

  attach() {
    this.element.addEventListener("pointerdown", this.onPointerDown, {
      capture: true,
    });
  }

  destroy() {
    this.element.removeEventListener("pointerdown", this.onPointerDown, true);
    this.cancelActiveResize();
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const resizeStart = this.resolveResizeStart(event);
    if (!resizeStart) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.beginActiveResize(event, resizeStart);
  };

  private beginActiveResize(
    event: PointerEvent,
    resizeStart: GpuNodeResizeStart,
  ) {
    const { policy, startLayout, target } = resizeStart;
    const screenPoint = getEventPointRelativeToElement(event, this.element);
    const captureElement = target.targetElement ?? this.element;
    this.activeResize = {
      captureElement,
      direction: target.direction,
      frameHandle: null,
      lastLayout: startLayout,
      lastScreenPoint: screenPoint,
      nodeId: target.nodeId,
      pointerId: event.pointerId,
      policy,
      startLayout,
      startScreenPoint: screenPoint,
    };
    captureElement.setPointerCapture?.(event.pointerId);
    captureElement.addEventListener(
      "lostpointercapture",
      this.onLostPointerCapture,
    );
    this.addDocumentListeners();
    this.store.getState().setViewportInteractionFlags({ nodeResizing: true });
    this.options.onNodeResizeStart?.(
      this.createResizeChange(this.activeResize, startLayout, "start"),
    );
    this.options.requestFrame?.("resize");
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    const activeResize = this.activeResize;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    activeResize.lastScreenPoint = getEventPointRelativeToElement(
      event,
      this.element,
    );
    this.scheduleResizeFrame(activeResize);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const activeResize = this.activeResize;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.flushResizeFrame(activeResize);
    const finalLayout = this.resolveActiveResizeLayout(activeResize);
    this.options.onNodeResizeStop?.(
      this.createResizeChange(activeResize, finalLayout, "stop"),
    );
    this.releasePointerCapture(activeResize);
    this.clearActiveResize();
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    const activeResize = this.activeResize;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelActiveResize();
  };

  private readonly onLostPointerCapture = (event: PointerEvent) => {
    const activeResize = this.activeResize;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    this.cancelActiveResize();
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !this.activeResize) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelActiveResize();
  };

  private readonly onWindowBlur = () => {
    this.cancelActiveResize();
  };

  private readonly runResizeFrame = () => {
    const activeResize = this.activeResize;
    if (!activeResize) {
      return;
    }
    activeResize.frameHandle = null;
    this.emitActiveResizeFrame(activeResize);
  };

  private shouldStartResize(event: PointerEvent): boolean {
    if (isNodeResizeDisabled(this.options.disabled)) {
      return false;
    }
    if (event.button !== 0) {
      return false;
    }
    return !this.activeResize;
  }

  private resolveResizeTarget(event: PointerEvent): GpuNodeResizeTarget | null {
    return (
      this.options.resolveResizeTarget?.(event) ??
      resolveGpuNodeResizeTargetFromEventTarget(event.target)
    );
  }

  private resolveResizeStart(event: PointerEvent): GpuNodeResizeStart | null {
    if (!this.shouldStartResize(event)) {
      return null;
    }
    const target = this.resolveResizeTarget(event);
    const startLayout = target
      ? this.resolveResizeStartLayout(target.nodeId)
      : null;
    if (!target || !startLayout) {
      return null;
    }
    const policy = this.resolveResizePolicy({
      direction: target.direction,
      node: startLayout,
      nodeId: target.nodeId,
      ...(target.targetElement ? { targetElement: target.targetElement } : {}),
    });
    return policy?.directions.has(target.direction)
      ? { policy, startLayout, target }
      : null;
  }

  private resolveResizeStartLayout(
    nodeId: string,
  ): NumericGpuNodeLayout | null {
    const node = this.options
      .getNodes()
      .find((candidate) => candidate.nodeId === nodeId);
    return node ? toNumericGpuNodeLayout(node) : null;
  }

  private resolveResizePolicy(
    input: GpuNodeResizePolicyInput,
  ): ResolvedGpuNodeResizePolicy | null {
    const policy = this.options.getResizePolicy?.(input);
    if (policy === false || policy?.enabled === false) {
      return null;
    }
    return resolveGpuNodeResizePolicy(policy ?? undefined);
  }

  private scheduleResizeFrame(activeResize: ActiveGpuNodeResize) {
    if (activeResize.frameHandle !== null) {
      return;
    }
    activeResize.frameHandle = this.requestAnimationFrame(this.runResizeFrame);
  }

  private flushResizeFrame(activeResize: ActiveGpuNodeResize) {
    if (activeResize.frameHandle === null) {
      return;
    }
    this.cancelAnimationFrame(activeResize.frameHandle);
    activeResize.frameHandle = null;
    this.emitActiveResizeFrame(activeResize);
  }

  private emitActiveResizeFrame(activeResize: ActiveGpuNodeResize): boolean {
    const nextLayout = this.resolveActiveResizeLayout(activeResize);
    if (
      nextLayout.width === activeResize.lastLayout.width &&
      nextLayout.height === activeResize.lastLayout.height
    ) {
      return false;
    }
    const change = this.createResizeChange(activeResize, nextLayout, "resize");
    activeResize.lastLayout = nextLayout;
    this.options.onNodeResize?.(change);
    this.options.requestFrame?.("resize");
    return true;
  }

  private resolveActiveResizeLayout(
    activeResize: ActiveGpuNodeResize,
  ): NumericGpuNodeLayout {
    return resizeGpuNodeLayout({
      direction: activeResize.direction,
      pointerDelta: this.getResizePointerDelta(activeResize),
      policy: toGpuNodeResizePolicy(activeResize.policy),
      startLayout: activeResize.startLayout,
    });
  }

  private getResizePointerDelta(activeResize: ActiveGpuNodeResize): GpuPoint {
    const zoom = normalizeGpuViewport(this.store.getState().transform).zoom;
    return {
      x:
        (activeResize.lastScreenPoint.x - activeResize.startScreenPoint.x) /
        zoom,
      y:
        (activeResize.lastScreenPoint.y - activeResize.startScreenPoint.y) /
        zoom,
    };
  }

  private createResizeChange(
    activeResize: ActiveGpuNodeResize,
    layout: NumericGpuNodeLayout,
    phase: GpuNodeResizePhase,
  ): GpuNodeResizeChange {
    return {
      active: phase === "start" || phase === "resize",
      direction: activeResize.direction,
      layout,
      nodeId: activeResize.nodeId,
      phase,
      pointerDelta:
        phase === "cancel"
          ? ZERO_POINT
          : this.getResizePointerDelta(activeResize),
      sizeDelta: {
        height: layout.height - activeResize.lastLayout.height,
        width: layout.width - activeResize.lastLayout.width,
      },
      startLayout: activeResize.startLayout,
      totalSizeDelta: {
        height: layout.height - activeResize.startLayout.height,
        width: layout.width - activeResize.startLayout.width,
      },
    };
  }

  private cancelActiveResize() {
    const activeResize = this.activeResize;
    if (!activeResize) {
      return;
    }
    this.cancelPendingResizeFrame(activeResize);
    this.options.onNodeResizeCancel?.(
      this.createResizeChange(activeResize, activeResize.startLayout, "cancel"),
    );
    this.releasePointerCapture(activeResize);
    this.clearActiveResize();
  }

  private clearActiveResize() {
    const activeResize = this.activeResize;
    this.activeResize = null;
    if (activeResize) {
      activeResize.captureElement.removeEventListener(
        "lostpointercapture",
        this.onLostPointerCapture,
      );
    }
    this.removeDocumentListeners();
    this.store.getState().setViewportInteractionFlags({ nodeResizing: false });
    this.options.requestFrame?.("texture-upload");
  }

  private cancelPendingResizeFrame(activeResize: ActiveGpuNodeResize) {
    if (activeResize.frameHandle === null) {
      return;
    }
    this.cancelAnimationFrame(activeResize.frameHandle);
    activeResize.frameHandle = null;
  }

  private releasePointerCapture(activeResize: ActiveGpuNodeResize) {
    if (
      activeResize.captureElement.hasPointerCapture?.(
        activeResize.pointerId,
      ) === false
    ) {
      return;
    }
    activeResize.captureElement.releasePointerCapture?.(activeResize.pointerId);
  }

  private addDocumentListeners() {
    const ownerDocument = this.element.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    ownerDocument.addEventListener("pointermove", this.onPointerMove, {
      capture: true,
    });
    ownerDocument.addEventListener("pointerup", this.onPointerUp, {
      capture: true,
    });
    ownerDocument.addEventListener("pointercancel", this.onPointerCancel, {
      capture: true,
    });
    ownerDocument.addEventListener("keydown", this.onKeyDown, {
      capture: true,
    });
    ownerWindow?.addEventListener("blur", this.onWindowBlur);
  }

  private removeDocumentListeners() {
    const ownerDocument = this.element.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    ownerDocument.removeEventListener("pointermove", this.onPointerMove, true);
    ownerDocument.removeEventListener("pointerup", this.onPointerUp, true);
    ownerDocument.removeEventListener(
      "pointercancel",
      this.onPointerCancel,
      true,
    );
    ownerDocument.removeEventListener("keydown", this.onKeyDown, true);
    ownerWindow?.removeEventListener("blur", this.onWindowBlur);
  }
}

function resizeGpuNodeWithAspectRatio({
  direction,
  pointerDelta,
  policy,
  requestedSize,
  startLayout,
}: {
  readonly direction: GpuNodeResizeDirection;
  readonly pointerDelta: GpuPoint;
  readonly policy: ResolvedGpuNodeResizePolicy;
  readonly requestedSize: GpuNodeResizeSize;
  readonly startLayout: NumericGpuNodeLayout;
}): NumericGpuNodeLayout {
  const aspectRatio = getGpuNodeResizeAspectRatio(startLayout, policy);
  const primaryAxis = resolveAspectRatioPrimaryAxis({
    direction,
    pointerDelta,
    startLayout,
  });
  if (primaryAxis === "width") {
    const nextWidth = clampAspectRatioPrimaryValue({
      maxPrimary: Math.min(
        policy.maxWidth,
        (policy.maxHeight - policy.aspectRatioExtraHeight) * aspectRatio +
          policy.aspectRatioExtraWidth,
      ),
      minPrimary: Math.max(
        policy.minWidth,
        (policy.minHeight - policy.aspectRatioExtraHeight) * aspectRatio +
          policy.aspectRatioExtraWidth,
      ),
      snapGridValue: policy.snapGrid?.[0],
      snapToGrid: policy.snapToGrid,
      value: requestedSize.width,
    });
    return createGpuNodeResizeLayout(startLayout, {
      height:
        (nextWidth - policy.aspectRatioExtraWidth) / aspectRatio +
        policy.aspectRatioExtraHeight,
      width: nextWidth,
    });
  }

  const nextHeight = clampAspectRatioPrimaryValue({
    maxPrimary: Math.min(
      policy.maxHeight,
      (policy.maxWidth - policy.aspectRatioExtraWidth) / aspectRatio +
        policy.aspectRatioExtraHeight,
    ),
    minPrimary: Math.max(
      policy.minHeight,
      (policy.minWidth - policy.aspectRatioExtraWidth) / aspectRatio +
        policy.aspectRatioExtraHeight,
    ),
    snapGridValue: policy.snapGrid?.[1],
    snapToGrid: policy.snapToGrid,
    value: requestedSize.height,
  });
  return createGpuNodeResizeLayout(startLayout, {
    height: nextHeight,
    width:
      (nextHeight - policy.aspectRatioExtraHeight) * aspectRatio +
      policy.aspectRatioExtraWidth,
  });
}

function getGpuNodeResizeAspectRatio(
  startLayout: NumericGpuNodeLayout,
  policy: Pick<
    ResolvedGpuNodeResizePolicy,
    "aspectRatioExtraHeight" | "aspectRatioExtraWidth"
  >,
) {
  const contentWidth = startLayout.width - policy.aspectRatioExtraWidth;
  const contentHeight = startLayout.height - policy.aspectRatioExtraHeight;
  if (contentWidth <= 0 || contentHeight <= 0) {
    throw new Error("resize aspect ratio extras exceed the node size.");
  }
  return contentWidth / contentHeight;
}

function resolveAspectRatioPrimaryAxis({
  direction,
  pointerDelta,
  startLayout,
}: {
  readonly direction: GpuNodeResizeDirection;
  readonly pointerDelta: GpuPoint;
  readonly startLayout: NumericGpuNodeLayout;
}): "height" | "width" {
  if (direction === "right") {
    return "width";
  }
  if (direction === "bottom") {
    return "height";
  }
  const widthChange = Math.abs(pointerDelta.x / startLayout.width);
  const heightChange = Math.abs(pointerDelta.y / startLayout.height);
  return widthChange >= heightChange ? "width" : "height";
}

function clampAspectRatioPrimaryValue({
  maxPrimary,
  minPrimary,
  snapGridValue,
  snapToGrid,
  value,
}: {
  readonly maxPrimary: number;
  readonly minPrimary: number;
  readonly snapGridValue: number | undefined;
  readonly snapToGrid: boolean;
  readonly value: number;
}): number {
  if (minPrimary > maxPrimary) {
    throw new Error("resize constraints cannot satisfy aspect ratio.");
  }
  const snapped =
    snapToGrid && snapGridValue !== undefined
      ? snapGpuNodeResizeValue(value, snapGridValue)
      : value;
  return clampNumber(snapped, minPrimary, maxPrimary);
}

function resolveGpuNodeResizePolicy(
  policy: GpuNodeResizePolicy | undefined,
): ResolvedGpuNodeResizePolicy {
  const constraints = resolveGpuNodeResizeConstraints(policy);
  const snapPolicy = resolveGpuNodeResizeSnapPolicy(policy);
  return {
    aspectRatio: Boolean(policy?.aspectRatio),
    aspectRatioExtraHeight: resolveGpuNodeResizeAspectRatioExtra(
      "aspect ratio extra height",
      policy?.aspectRatioExtraHeight,
    ),
    aspectRatioExtraWidth: resolveGpuNodeResizeAspectRatioExtra(
      "aspect ratio extra width",
      policy?.aspectRatioExtraWidth,
    ),
    directions: new Set(policy?.directions ?? DEFAULT_RESIZE_DIRECTIONS),
    ...constraints,
    ...snapPolicy,
  };
}

function resolveGpuNodeResizeAspectRatioExtra(
  name: string,
  value: number | undefined,
): number {
  const resolved = value ?? 0;
  assertFiniteNonNegative(name, resolved);
  return resolved;
}

function resolveGpuNodeResizeConstraints(
  policy: GpuNodeResizePolicy | undefined,
): ResolvedGpuNodeResizeConstraints {
  const constraints = {
    maxHeight: policy?.maxHeight ?? Number.POSITIVE_INFINITY,
    maxWidth: policy?.maxWidth ?? Number.POSITIVE_INFINITY,
    minHeight: policy?.minHeight ?? 0,
    minWidth: policy?.minWidth ?? 0,
  };
  validateGpuNodeResizeConstraints(constraints);
  return constraints;
}

function validateGpuNodeResizeConstraints({
  maxHeight,
  maxWidth,
  minHeight,
  minWidth,
}: ResolvedGpuNodeResizeConstraints) {
  assertFiniteNonNegative("minimum resize width", minWidth);
  assertFiniteNonNegative("minimum resize height", minHeight);
  assertFinitePositiveOrInfinity("maximum resize width", maxWidth);
  assertFinitePositiveOrInfinity("maximum resize height", maxHeight);
  if (minWidth > maxWidth) {
    throw new Error(
      "minimum resize width must be less than or equal to maximum resize width.",
    );
  }
  if (minHeight > maxHeight) {
    throw new Error(
      "minimum resize height must be less than or equal to maximum resize height.",
    );
  }
}

function resolveGpuNodeResizeSnapPolicy(
  policy: GpuNodeResizePolicy | undefined,
): ResolvedGpuNodeResizeSnapPolicy {
  const snapToGrid = isSnapToGridEnabled(policy?.snapToGrid);
  if (!snapToGrid) {
    return { snapToGrid };
  }
  return {
    snapGrid: resolveGpuNodeResizeSnapGrid(policy?.snapGrid),
    snapToGrid,
  };
}

function resolveGpuNodeResizeSnapGrid(
  snapGrid: readonly [number, number] | undefined,
): readonly [number, number] {
  const grid = snapGrid ?? [1, 1];
  assertFinitePositive("resize snap grid x", grid[0]);
  assertFinitePositive("resize snap grid y", grid[1]);
  return grid;
}

function snapGpuNodeResizeValue(value: number, grid: number): number {
  assertFinitePositive("resize snap grid value", grid);
  return grid * Math.round(value / grid);
}

function toGpuNodeResizePolicy(
  policy: ResolvedGpuNodeResizePolicy,
): GpuNodeResizePolicy {
  return {
    aspectRatio: policy.aspectRatio,
    aspectRatioExtraHeight: policy.aspectRatioExtraHeight,
    aspectRatioExtraWidth: policy.aspectRatioExtraWidth,
    directions: Array.from(policy.directions),
    enabled: true,
    maxHeight: policy.maxHeight,
    maxWidth: policy.maxWidth,
    minHeight: policy.minHeight,
    minWidth: policy.minWidth,
    ...(policy.snapGrid ? { snapGrid: policy.snapGrid } : {}),
    snapToGrid: policy.snapToGrid,
  };
}

function toNumericGpuNodeLayout(
  node: GpuNodeLayout,
): NumericGpuNodeLayout | null {
  if (typeof node.width !== "number" || typeof node.height !== "number") {
    return null;
  }
  return {
    ...node,
    height: node.height,
    width: node.width,
  };
}

function getRequestedGpuNodeResizeSize({
  direction,
  pointerDelta,
  startLayout,
}: {
  readonly direction: GpuNodeResizeDirection;
  readonly pointerDelta: GpuPoint;
  readonly startLayout: NumericGpuNodeLayout;
}): GpuNodeResizeSize {
  return {
    height: resizesGpuNodeHeight(direction)
      ? startLayout.height + pointerDelta.y
      : startLayout.height,
    width: resizesGpuNodeWidth(direction)
      ? startLayout.width + pointerDelta.x
      : startLayout.width,
  };
}

function snapGpuNodeResizeSize({
  direction,
  policy,
  size,
}: {
  readonly direction: GpuNodeResizeDirection;
  readonly policy: ResolvedGpuNodeResizePolicy;
  readonly size: GpuNodeResizeSize;
}): GpuNodeResizeSize {
  if (!policy.snapToGrid || !policy.snapGrid) {
    return size;
  }
  return {
    height: resizesGpuNodeHeight(direction)
      ? snapGpuNodeResizeValue(size.height, policy.snapGrid[1])
      : size.height,
    width: resizesGpuNodeWidth(direction)
      ? snapGpuNodeResizeValue(size.width, policy.snapGrid[0])
      : size.width,
  };
}

function clampGpuNodeResizeSize(
  size: GpuNodeResizeSize,
  policy: ResolvedGpuNodeResizeConstraints,
): GpuNodeResizeSize {
  return {
    height: clampNumber(size.height, policy.minHeight, policy.maxHeight),
    width: clampNumber(size.width, policy.minWidth, policy.maxWidth),
  };
}

function createGpuNodeResizeLayout(
  startLayout: NumericGpuNodeLayout,
  size: GpuNodeResizeSize,
): NumericGpuNodeLayout {
  return {
    ...startLayout,
    height: size.height,
    width: size.width,
  };
}

function resizesGpuNodeHeight(direction: GpuNodeResizeDirection): boolean {
  return direction === "bottom" || direction === "bottomRight";
}

function resizesGpuNodeWidth(direction: GpuNodeResizeDirection): boolean {
  return direction === "right" || direction === "bottomRight";
}

function isSnapToGridEnabled(
  snapToGrid: boolean | (() => boolean) | undefined,
): boolean {
  return typeof snapToGrid === "function" ? snapToGrid() : Boolean(snapToGrid);
}

function isNodeResizeDisabled(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function getEventPointRelativeToElement(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  element: HTMLElement,
): GpuPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function assertFinitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}

function assertFinitePositiveOrInfinity(name: string, value: number) {
  if ((Number.isFinite(value) && value > 0) || value === Infinity) {
    return;
  }
  throw new Error(`${name} must be a finite positive number or Infinity.`);
}
