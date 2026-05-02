import { closeAllContextMenus } from "state/actions/contextMenus";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { isMacOs } from "utils/utils";
import { GPU_FLOW_CLASS_NAMES } from "../gpuFlowDomClasses";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  panGpuViewport,
  zoomGpuViewportAt,
  zoomGpuViewportByFactor,
} from "../viewportActions";
import type { GpuPoint } from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";

type GpuPanOnScrollMode =
  (typeof PanOnScrollModeEnum)[keyof typeof PanOnScrollModeEnum];

export type GpuPanZoomControllerOptions = {
  readonly element: HTMLElement;
  readonly isMacOS?: boolean | undefined;
  readonly panActivationKeyPressed?: boolean | undefined;
  readonly panOnDrag?: boolean | readonly number[] | undefined;
  readonly panOnScroll?: boolean | undefined;
  readonly panOnScrollMode?: GpuPanOnScrollMode | undefined;
  readonly panOnScrollSpeed?: number | undefined;
  readonly preventScrolling?: boolean | undefined;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
  readonly zoomActivationKeyPressed?: boolean | undefined;
  readonly zoomOnDoubleClick?: boolean | undefined;
  readonly zoomOnPinch?: boolean | undefined;
  readonly zoomOnScroll?: boolean | undefined;
};

type GpuPanZoomWheelDelta = {
  readonly deltaX: number;
  readonly deltaY: number;
};

type ActivePointerPan = {
  readonly pointerId: number;
  lastClientX: number;
  lastClientY: number;
};

type ResolvedGpuPanZoomControllerOptions = {
  readonly panActivationKeyPressed: boolean | undefined;
  readonly panOnDrag: boolean | readonly number[];
  readonly panOnScroll: boolean;
  readonly panOnScrollMode: GpuPanOnScrollMode;
  readonly panOnScrollSpeed: number;
  readonly preventScrolling: boolean;
  readonly requestFrame: ((reason: GpuFrameReason) => void) | undefined;
  readonly zoomActivationKeyPressed: boolean | undefined;
  readonly zoomOnDoubleClick: boolean;
  readonly zoomOnPinch: boolean;
  readonly zoomOnScroll: boolean;
};

const DEFAULT_PAN_ZOOM_OPTIONS = {
  panOnDrag: true,
  panOnScroll: false,
  panOnScrollMode: PanOnScrollModeEnum.free,
  panOnScrollSpeed: 0.5,
  preventScrolling: true,
  zoomOnDoubleClick: true,
  zoomOnPinch: true,
  zoomOnScroll: true,
} satisfies Pick<
  Required<GpuPanZoomControllerOptions>,
  | "panOnDrag"
  | "panOnScroll"
  | "panOnScrollMode"
  | "panOnScrollSpeed"
  | "preventScrolling"
  | "zoomOnDoubleClick"
  | "zoomOnPinch"
  | "zoomOnScroll"
>;

export function attachGpuPanZoomController(
  options: GpuPanZoomControllerOptions,
): () => void {
  const controller = new GpuPanZoomController(options);
  controller.attach();
  return () => controller.destroy();
}

export function resolveGpuPanOnScrollDelta({
  event,
  isMacOS,
  panOnScrollMode,
}: {
  readonly event: Pick<
    WheelEvent,
    "deltaMode" | "deltaX" | "deltaY" | "shiftKey"
  >;
  readonly isMacOS: boolean;
  readonly panOnScrollMode: GpuPanOnScrollMode;
}): GpuPanZoomWheelDelta {
  const deltaNormalize = event.deltaMode === 1 ? 20 : 1;
  let deltaX =
    panOnScrollMode === PanOnScrollModeEnum.vertical
      ? 0
      : event.deltaX * deltaNormalize;
  let deltaY =
    panOnScrollMode === PanOnScrollModeEnum.horizontal
      ? 0
      : event.deltaY * deltaNormalize;

  if (
    !isMacOS &&
    event.shiftKey &&
    panOnScrollMode !== PanOnScrollModeEnum.vertical
  ) {
    deltaX = event.deltaY * deltaNormalize;
    deltaY = 0;
  }

  return { deltaX, deltaY };
}

export function shouldHandleGpuWheelEvent({
  event,
  isMacOS,
  panOnScroll,
  preventScrolling,
  zoomActivationKeyPressed,
  zoomOnPinch,
  zoomOnScroll,
}: {
  readonly event: WheelEvent;
  readonly isMacOS: boolean;
  readonly panOnScroll: boolean;
  readonly preventScrolling: boolean;
  readonly zoomActivationKeyPressed?: boolean | undefined;
  readonly zoomOnPinch: boolean;
  readonly zoomOnScroll: boolean;
}): boolean {
  if (!preventScrolling) {
    return false;
  }
  const pinchZoom = isPinchZoomWheelEvent({ event, isMacOS, zoomOnPinch });
  if (
    shouldPreserveNativeWheelTarget({
      event,
      panOnScroll,
      pinchZoom,
      zoomActivationKeyPressed,
    })
  ) {
    return false;
  }
  if (event.ctrlKey && !pinchZoom) {
    return false;
  }
  return hasEnabledGpuWheelGesture({
    panOnScroll,
    pinchZoom,
    zoomActivationKeyPressed,
    zoomOnScroll,
  });
}

function shouldPreserveNativeWheelTarget({
  event,
  panOnScroll,
  pinchZoom,
  zoomActivationKeyPressed,
}: {
  readonly event: WheelEvent;
  readonly panOnScroll: boolean;
  readonly pinchZoom: boolean;
  readonly zoomActivationKeyPressed?: boolean | undefined;
}): boolean {
  if (isEventTargetWrappedWithClass(event, NO_WHEEL_CLASS_NAME)) {
    return !zoomActivationKeyPressed && !pinchZoom;
  }
  return (
    isEventTargetWrappedWithClass(event, NO_PAN_CLASS_NAME) &&
    panOnScroll &&
    !zoomActivationKeyPressed &&
    !pinchZoom
  );
}

function hasEnabledGpuWheelGesture({
  panOnScroll,
  pinchZoom,
  zoomActivationKeyPressed,
  zoomOnScroll,
}: {
  readonly panOnScroll: boolean;
  readonly pinchZoom: boolean;
  readonly zoomActivationKeyPressed?: boolean | undefined;
  readonly zoomOnScroll: boolean;
}): boolean {
  return Boolean(
    zoomActivationKeyPressed || zoomOnScroll || panOnScroll || pinchZoom,
  );
}

function resolveGpuPanZoomControllerOptions(
  options: GpuPanZoomControllerOptions,
): ResolvedGpuPanZoomControllerOptions {
  return {
    panActivationKeyPressed: options.panActivationKeyPressed,
    panOnDrag: options.panOnDrag ?? DEFAULT_PAN_ZOOM_OPTIONS.panOnDrag,
    panOnScroll: options.panOnScroll ?? DEFAULT_PAN_ZOOM_OPTIONS.panOnScroll,
    panOnScrollMode:
      options.panOnScrollMode ?? DEFAULT_PAN_ZOOM_OPTIONS.panOnScrollMode,
    panOnScrollSpeed:
      options.panOnScrollSpeed ?? DEFAULT_PAN_ZOOM_OPTIONS.panOnScrollSpeed,
    preventScrolling:
      options.preventScrolling ?? DEFAULT_PAN_ZOOM_OPTIONS.preventScrolling,
    requestFrame: options.requestFrame,
    zoomActivationKeyPressed: options.zoomActivationKeyPressed,
    zoomOnDoubleClick:
      options.zoomOnDoubleClick ?? DEFAULT_PAN_ZOOM_OPTIONS.zoomOnDoubleClick,
    zoomOnPinch: options.zoomOnPinch ?? DEFAULT_PAN_ZOOM_OPTIONS.zoomOnPinch,
    zoomOnScroll: options.zoomOnScroll ?? DEFAULT_PAN_ZOOM_OPTIONS.zoomOnScroll,
  };
}

class GpuPanZoomController {
  private activePan: ActivePointerPan | null = null;
  private readonly element: HTMLElement;
  private readonly isMacOS: boolean;
  private readonly options: ResolvedGpuPanZoomControllerOptions;
  private panScrollTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly store: GpuFlowViewportStoreApi;
  private wheelZoomTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: GpuPanZoomControllerOptions) {
    this.element = options.element;
    this.isMacOS = options.isMacOS ?? isMacOs();
    this.options = resolveGpuPanZoomControllerOptions(options);
    this.store = options.store ?? gpuFlowViewportStore;
  }

  attach() {
    this.element.addEventListener("wheel", this.onWheel, { passive: false });
    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerEnd);
    this.element.addEventListener("pointercancel", this.onPointerEnd);
    this.element.addEventListener("dblclick", this.onDoubleClick);
  }

  destroy() {
    this.element.removeEventListener("wheel", this.onWheel);
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerEnd);
    this.element.removeEventListener("pointercancel", this.onPointerEnd);
    this.element.removeEventListener("dblclick", this.onDoubleClick);
    this.endPointerPan();
    this.clearWheelZoomTimeout();
    this.clearPanScrollTimeout();
  }

  private readonly onWheel = (event: WheelEvent) => {
    if (
      !shouldHandleGpuWheelEvent({
        event,
        isMacOS: this.isMacOS,
        panOnScroll: this.options.panOnScroll,
        preventScrolling: this.options.preventScrolling,
        zoomActivationKeyPressed: this.options.zoomActivationKeyPressed,
        zoomOnPinch: this.options.zoomOnPinch,
        zoomOnScroll: this.options.zoomOnScroll,
      })
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const pinchZoom = isPinchZoomWheelEvent({
      event,
      isMacOS: this.isMacOS,
      zoomOnPinch: this.options.zoomOnPinch,
    });
    const zoomRequested =
      pinchZoom ||
      Boolean(this.options.zoomActivationKeyPressed) ||
      (!this.options.panOnScroll && this.options.zoomOnScroll);

    if (zoomRequested) {
      this.startWheelZoomBurst();
      this.zoomFromWheel(event);
      this.scheduleWheelZoomBurstEnd();
      return;
    }

    this.panFromWheel(event);
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.shouldStartPointerPan(event)) {
      return;
    }
    event.preventDefault();
    closeContextMenusForViewportGesture();
    this.activePan = {
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      pointerId: event.pointerId,
    };
    this.store.getState().setViewportInteractionFlags({
      paneDragging: true,
      pointerPanning: true,
    });
    this.element.setPointerCapture?.(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const activePan = this.activePan;
    if (!activePan || activePan.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const delta = {
      x: event.clientX - activePan.lastClientX,
      y: event.clientY - activePan.lastClientY,
    };
    activePan.lastClientX = event.clientX;
    activePan.lastClientY = event.clientY;
    if (delta.x === 0 && delta.y === 0) {
      return;
    }
    if (panGpuViewport(delta, { store: this.store })) {
      this.requestViewportFrame();
    }
  };

  private readonly onPointerEnd = (event: PointerEvent) => {
    if (!this.activePan || this.activePan.pointerId !== event.pointerId) {
      return;
    }
    this.element.releasePointerCapture?.(event.pointerId);
    this.endPointerPan();
  };

  private readonly onDoubleClick = (event: MouseEvent) => {
    if (!this.options.zoomOnDoubleClick) {
      return;
    }
    if (isEventTargetWrappedWithClass(event, NO_PAN_CLASS_NAME)) {
      return;
    }
    event.preventDefault();
    const point = getEventPointRelativeToElement(event, this.element);
    if (zoomGpuViewportByFactor(2, { point, store: this.store })) {
      this.requestViewportFrame();
    }
  };

  private panFromWheel(event: WheelEvent) {
    const { deltaX, deltaY } = resolveGpuPanOnScrollDelta({
      event,
      isMacOS: this.isMacOS,
      panOnScrollMode: this.options.panOnScrollMode,
    });
    const changed = panGpuViewport(
      {
        x: -deltaX * this.options.panOnScrollSpeed,
        y: -deltaY * this.options.panOnScrollSpeed,
      },
      { store: this.store },
    );
    if (changed) {
      this.requestViewportFrame();
    }
    this.startPanScrollBurst();
    this.schedulePanScrollBurstEnd();
  }

  private zoomFromWheel(event: WheelEvent) {
    const currentZoom = this.store.getState().getViewport().zoom;
    const factor = event.ctrlKey && this.isMacOS ? 10 : 1;
    const wheelZoomDelta = getGpuWheelZoomDelta(event, factor);
    const point = getEventPointRelativeToElement(event, this.element);
    const changed = zoomGpuViewportAt(
      currentZoom * Math.pow(2, wheelZoomDelta),
      {
        point,
        store: this.store,
      },
    );
    if (changed) {
      this.requestViewportFrame();
    }
  }

  private shouldStartPointerPan(event: PointerEvent): boolean {
    const panActivationKeyPressed = Boolean(
      this.options.panActivationKeyPressed,
    );
    const panOnDrag = panActivationKeyPressed
      ? DEFAULT_PAN_ZOOM_OPTIONS.panOnDrag
      : this.options.panOnDrag;
    if (!panOnDrag) {
      return false;
    }
    if (hasBlockedPanModifier(event)) {
      return false;
    }
    if (!isAllowedPanButton(event.button, panOnDrag)) {
      return false;
    }
    if (this.store.getState().selectionKeyPressed) {
      return false;
    }
    if (isEventTargetWrappedWithClass(event, NO_PAN_CLASS_NAME)) {
      return false;
    }
    if (shouldBlockPrimaryNodePan(event, panActivationKeyPressed)) {
      return false;
    }
    return true;
  }

  private startWheelZoomBurst() {
    this.clearWheelZoomTimeout();
    this.store.getState().setViewportInteractionFlags({ wheelZooming: true });
  }

  private scheduleWheelZoomBurstEnd() {
    this.clearWheelZoomTimeout();
    this.wheelZoomTimeout = setTimeout(() => {
      this.store
        .getState()
        .setViewportInteractionFlags({ wheelZooming: false });
      this.requestTextureUploadFrame();
      this.wheelZoomTimeout = null;
    }, 180);
  }

  private startPanScrollBurst() {
    this.clearPanScrollTimeout();
    this.store.getState().setViewportInteractionFlags({ panScrolling: true });
  }

  private schedulePanScrollBurstEnd() {
    this.clearPanScrollTimeout();
    this.panScrollTimeout = setTimeout(() => {
      this.store
        .getState()
        .setViewportInteractionFlags({ panScrolling: false });
      this.requestTextureUploadFrame();
      this.panScrollTimeout = null;
    }, 150);
  }

  private endPointerPan() {
    this.activePan = null;
    this.store.getState().setViewportInteractionFlags({
      paneDragging: false,
      pointerPanning: false,
    });
    this.requestTextureUploadFrame();
  }

  private clearWheelZoomTimeout() {
    if (this.wheelZoomTimeout !== null) {
      clearTimeout(this.wheelZoomTimeout);
      this.wheelZoomTimeout = null;
    }
  }

  private clearPanScrollTimeout() {
    if (this.panScrollTimeout !== null) {
      clearTimeout(this.panScrollTimeout);
      this.panScrollTimeout = null;
    }
  }

  private requestViewportFrame() {
    this.options.requestFrame?.("viewport");
  }

  private requestTextureUploadFrame() {
    this.options.requestFrame?.("texture-upload");
  }
}

function getGpuWheelZoomDelta(event: WheelEvent, factor = 1): number {
  return -event.deltaY * getGpuWheelDeltaModeFactor(event.deltaMode) * factor;
}

function getGpuWheelDeltaModeFactor(deltaMode: number): number {
  if (deltaMode === 1) {
    return 0.05;
  }
  if (deltaMode === 0) {
    return 0.002;
  }
  return 1;
}

function isPinchZoomWheelEvent({
  event,
  isMacOS,
  zoomOnPinch,
}: {
  readonly event: Pick<WheelEvent, "ctrlKey">;
  readonly isMacOS: boolean;
  readonly zoomOnPinch: boolean;
}): boolean {
  return event.ctrlKey && zoomOnPinch && isMacOS;
}

function isAllowedPanButton(
  button: number,
  panOnDrag: boolean | readonly number[],
): boolean {
  if (Array.isArray(panOnDrag)) {
    return panOnDrag.includes(button);
  }
  return button <= 1;
}

function isPrimaryButtonNodeEvent(event: PointerEvent): boolean {
  if (event.button !== 0) {
    return false;
  }
  return (
    isEventTargetWrappedWithClass(event, "setta-gpu-flow__node") ||
    isEventTargetWrappedWithClass(event, GPU_FLOW_CLASS_NAMES.node)
  );
}

function hasBlockedPanModifier(
  event: Pick<PointerEvent, "ctrlKey" | "metaKey">,
): boolean {
  return event.ctrlKey || event.metaKey;
}

function shouldBlockPrimaryNodePan(
  event: PointerEvent,
  panActivationKeyPressed: boolean,
): boolean {
  return !panActivationKeyPressed && isPrimaryButtonNodeEvent(event);
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

function isEventTargetWrappedWithClass(
  event: Event,
  className: string,
): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(`.${className}`) !== null;
}

function closeContextMenusForViewportGesture() {
  closeAllContextMenus();
}
