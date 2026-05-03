import type {
  GpuEdgeReconnectAnchor,
  GpuEdgeScene,
} from "../edges/edgeSources";
import type {
  Connection,
  GpuFlowAutoPanInsetsInput,
  GpuFlowConnectionContext,
} from "../flowTypes";
import { handlePointerDown } from "../Handle/handler";
import type { ValidConnectionFunc } from "../Handle/utils";
import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import type { GpuFlowScene } from "../scene";
import { screenToFlowPosition, type GpuPoint } from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";
import {
  getEventPointRelativeToStoreDomNode,
  isGpuFlowEdgeInteractionTarget,
} from "./edges";

export type GpuEdgeReconnectOptions = {
  readonly autoPanInsetsPx?: GpuFlowAutoPanInsetsInput;
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly isValidConnection?: ValidConnectionFunc | undefined;
  readonly onReconnect: (
    edgeId: string,
    connection: Connection,
    context?: GpuFlowConnectionContext,
  ) => void;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type GpuEdgeReconnectControllerOptions = GpuEdgeReconnectOptions & {
  readonly element: HTMLElement;
  readonly getFlowScene?: (() => GpuFlowScene | null | undefined) | undefined;
  readonly getScene: () => GpuEdgeScene | null | undefined;
  readonly layoutStore: GpuFlowLayoutStoreApi;
};

type GpuEdgeReconnectAnchorInteractionHit = {
  readonly anchor: GpuEdgeReconnectAnchor;
  readonly distance: number;
  readonly flowPoint: GpuPoint;
  readonly screenPoint: GpuPoint;
  readonly zIndex: number;
};

const alwaysValidConnection: ValidConnectionFunc = () => true;

export function attachGpuEdgeReconnectController(
  options: GpuEdgeReconnectControllerOptions,
): () => void {
  const controller = new GpuEdgeReconnectController(options);
  controller.attach();
  return () => controller.destroy();
}

export function hitTestGpuEdgeReconnectAnchorInteraction({
  event,
  getScene,
  store = gpuFlowViewportStore,
}: {
  readonly event: Pick<MouseEvent, "clientX" | "clientY">;
  readonly getScene: () => GpuEdgeScene | null | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
}): GpuEdgeReconnectAnchorInteractionHit | null {
  const scene = getScene();
  if (!scene || scene.reconnectAnchors.length === 0) {
    return null;
  }
  const screenPoint = getEventPointRelativeToStoreDomNode(event, store);
  const flowPoint = screenToFlowPosition(
    screenPoint,
    store.getState().transform,
  );
  return hitTestGpuEdgeReconnectAnchors({
    anchors: scene.reconnectAnchors,
    flowPoint,
    screenPoint,
  });
}

function hitTestGpuEdgeReconnectAnchors({
  anchors,
  flowPoint,
  screenPoint,
}: {
  readonly anchors: readonly GpuEdgeReconnectAnchor[];
  readonly flowPoint: GpuPoint;
  readonly screenPoint: GpuPoint;
}): GpuEdgeReconnectAnchorInteractionHit | null {
  let bestHit: GpuEdgeReconnectAnchorInteractionHit | null = null;
  for (const anchor of anchors) {
    const distance = Math.hypot(flowPoint.x - anchor.x, flowPoint.y - anchor.y);
    if (distance > anchor.radius) {
      continue;
    }
    const zIndex = anchor.zIndex ?? 0;
    const hit = { anchor, distance, flowPoint, screenPoint, zIndex };
    if (!bestHit || isGpuEdgeReconnectAnchorHitAbove(hit, bestHit)) {
      bestHit = hit;
    }
  }
  return bestHit;
}

class GpuEdgeReconnectController {
  private readonly disabled: boolean | (() => boolean) | undefined;
  private readonly autoPanInsetsPx: GpuFlowAutoPanInsetsInput;
  private readonly element: HTMLElement;
  private readonly getFlowScene:
    | (() => GpuFlowScene | null | undefined)
    | undefined;
  private readonly getScene: () => GpuEdgeScene | null | undefined;
  private readonly isValidConnection: ValidConnectionFunc;
  private readonly layoutStore: GpuFlowLayoutStoreApi;
  private readonly onReconnect: (
    edgeId: string,
    connection: Connection,
    context?: GpuFlowConnectionContext,
  ) => void;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuEdgeReconnectControllerOptions) {
    this.autoPanInsetsPx = options.autoPanInsetsPx;
    this.disabled = options.disabled;
    this.element = options.element;
    this.getFlowScene = options.getFlowScene;
    this.getScene = options.getScene;
    this.isValidConnection = options.isValidConnection ?? alwaysValidConnection;
    this.layoutStore = options.layoutStore;
    this.onReconnect = options.onReconnect;
    this.store = options.store ?? gpuFlowViewportStore;
  }

  attach() {
    this.element.addEventListener("pointerdown", this.onPointerDown, {
      capture: true,
    });
  }

  destroy() {
    this.element.removeEventListener("pointerdown", this.onPointerDown, true);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    const hit = this.hitTestEvent(event);
    if (!hit) {
      return;
    }
    preventGpuEdgeReconnectEvent(event);
    const anchor = hit.anchor;
    handlePointerDown({
      autoPanInsetsPx: this.autoPanInsetsPx,
      edgeUpdaterType: anchor.fixedHandleType,
      event,
      getScene: this.getFlowScene,
      handleId: anchor.fixedHandleId,
      isTarget: anchor.fixedIsTarget,
      isValidConnection: this.isValidConnection,
      layoutStore: this.layoutStore,
      nodeId: anchor.fixedSectionId,
      onConnect: (connection, context) => {
        this.onReconnect(anchor.edgeId, connection, context);
      },
      store: this.store,
    });
  };

  private hitTestEvent(
    event: PointerEvent,
  ): GpuEdgeReconnectAnchorInteractionHit | null {
    if (isGpuEdgeReconnectDisabled(this.disabled)) {
      return null;
    }
    if (!isGpuFlowEdgeInteractionTarget(event, this.element)) {
      return null;
    }
    return hitTestGpuEdgeReconnectAnchorInteraction({
      event,
      getScene: this.getScene,
      store: this.store,
    });
  }
}

function isGpuEdgeReconnectAnchorHitAbove(
  hit: GpuEdgeReconnectAnchorInteractionHit,
  current: GpuEdgeReconnectAnchorInteractionHit,
): boolean {
  if (hit.zIndex !== current.zIndex) {
    return hit.zIndex > current.zIndex;
  }
  return hit.distance < current.distance;
}

function isGpuEdgeReconnectDisabled(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function preventGpuEdgeReconnectEvent(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
