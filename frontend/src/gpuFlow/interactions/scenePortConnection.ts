import type {
  Connection,
  GpuFlowAutoPanInsetsInput,
  GpuFlowConnectionContext,
  HandleConnectionCandidate,
  HandleType,
} from "../flowTypes";
import { handlePointerDown } from "../Handle/handler";
import type { ValidConnectionFunc } from "../Handle/utils";
import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import type {
  GpuFlowScene,
  GpuPortAnchorDescriptor,
  GpuSectionSceneNode,
} from "../scene";
import { getGpuPortAnchorHandleType } from "../scene";
import {
  normalizeGpuViewport,
  screenToFlowPosition,
  type GpuPoint,
} from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";
import { getEventPointRelativeToStoreDomNode } from "./edges";

export type GpuScenePortConnectionStart = {
  readonly connectionStartSemanticType?: HandleType | undefined;
  readonly handleId: string;
  readonly ownerSectionId: string;
  readonly type: HandleType;
};

type GpuScenePortConnectionHit = {
  readonly anchor: GpuPortAnchorDescriptor;
  readonly distance: number;
  readonly flowPoint: GpuPoint;
  readonly screenPoint: GpuPoint;
  readonly section: GpuSectionSceneNode;
  readonly start: GpuScenePortConnectionStart;
  readonly zIndex: number;
};

export type GpuScenePortConnectionOptions = {
  readonly autoPanInsetsPx?: GpuFlowAutoPanInsetsInput;
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly hitRadiusPx?: number | undefined;
  readonly isConnectionCandidateAllowed?:
    | ((
        candidate: HandleConnectionCandidate,
        start: GpuScenePortConnectionStart,
      ) => boolean)
    | undefined;
  readonly isValidConnection?:
    | ((connection: Connection, start: GpuScenePortConnectionStart) => boolean)
    | undefined;
  readonly onConnect: (
    connection: Connection,
    context: GpuFlowConnectionContext | undefined,
    start: GpuScenePortConnectionStart,
  ) => void;
  readonly pointerUpSnapRadius?: number | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

export type GpuScenePortConnectionControllerOptions =
  GpuScenePortConnectionOptions & {
    readonly element: HTMLElement;
    readonly getScene: () => GpuFlowScene | null | undefined;
    readonly layoutStore: GpuFlowLayoutStoreApi;
  };

const DEFAULT_SCENE_PORT_HIT_RADIUS_PX = 12;
const alwaysValidConnection: ValidConnectionFunc = () => true;

export function attachGpuScenePortConnectionController(
  options: GpuScenePortConnectionControllerOptions,
): () => void {
  const controller = new GpuScenePortConnectionController(options);
  controller.attach();
  return () => controller.destroy();
}

export function hitTestGpuScenePortConnection({
  event,
  getScene,
  hitRadiusPx = DEFAULT_SCENE_PORT_HIT_RADIUS_PX,
  store = gpuFlowViewportStore,
}: {
  readonly event: Pick<PointerEvent, "clientX" | "clientY">;
  readonly getScene: () => GpuFlowScene | null | undefined;
  readonly hitRadiusPx?: number | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
}): GpuScenePortConnectionHit | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const screenPoint = getEventPointRelativeToStoreDomNode(event, store);
  const viewport = normalizeGpuViewport(store.getState().transform);
  const flowPoint = screenToFlowPosition(screenPoint, viewport);
  const radius = resolveGpuScenePortHitRadius(hitRadiusPx, viewport.zoom);
  let bestHit: GpuScenePortConnectionHit | null = null;
  for (const section of scene.sections) {
    for (const anchor of section.portAnchors) {
      const hit = getGpuScenePortConnectionAnchorHit({
        anchor,
        flowPoint,
        radius,
        screenPoint,
        section,
      });
      if (!hit) {
        continue;
      }
      if (!bestHit || isGpuScenePortConnectionHitAbove(hit, bestHit)) {
        bestHit = hit;
      }
    }
  }
  return bestHit;
}

function getGpuScenePortConnectionAnchorHit({
  anchor,
  flowPoint,
  radius,
  screenPoint,
  section,
}: {
  readonly anchor: GpuPortAnchorDescriptor;
  readonly flowPoint: GpuPoint;
  readonly radius: number;
  readonly screenPoint: GpuPoint;
  readonly section: GpuSectionSceneNode;
}): GpuScenePortConnectionHit | null {
  const type = getGpuPortAnchorHandleType(anchor);
  if (!type || anchor.isConnectableStart === false) {
    return null;
  }
  const anchorPoint = {
    x: section.worldRect.x + anchor.localPosition.x,
    y: section.worldRect.y + anchor.localPosition.y,
  };
  const distance = Math.hypot(
    flowPoint.x - anchorPoint.x,
    flowPoint.y - anchorPoint.y,
  );
  if (distance > radius) {
    return null;
  }
  return {
    anchor,
    distance,
    flowPoint,
    screenPoint,
    section,
    start: {
      ...(anchor.connectionStartSemanticType
        ? { connectionStartSemanticType: anchor.connectionStartSemanticType }
        : {}),
      handleId: anchor.id,
      ownerSectionId: section.sectionId,
      type,
    },
    zIndex: section.zIndex ?? 0,
  };
}

class GpuScenePortConnectionController {
  private readonly autoPanInsetsPx: GpuFlowAutoPanInsetsInput;
  private readonly disabled: boolean | (() => boolean) | undefined;
  private readonly element: HTMLElement;
  private readonly getScene: () => GpuFlowScene | null | undefined;
  private readonly hitRadiusPx: number | undefined;
  private readonly isConnectionCandidateAllowed:
    | ((
        candidate: HandleConnectionCandidate,
        start: GpuScenePortConnectionStart,
      ) => boolean)
    | undefined;
  private readonly isValidConnection: NonNullable<
    GpuScenePortConnectionOptions["isValidConnection"]
  >;
  private readonly layoutStore: GpuFlowLayoutStoreApi;
  private readonly onConnect: GpuScenePortConnectionOptions["onConnect"];
  private readonly pointerUpSnapRadius: number | undefined;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuScenePortConnectionControllerOptions) {
    this.autoPanInsetsPx = options.autoPanInsetsPx;
    this.disabled = options.disabled;
    this.element = options.element;
    this.getScene = options.getScene;
    this.hitRadiusPx = options.hitRadiusPx;
    this.isConnectionCandidateAllowed = options.isConnectionCandidateAllowed;
    this.isValidConnection = options.isValidConnection ?? alwaysValidConnection;
    this.layoutStore = options.layoutStore;
    this.onConnect = options.onConnect;
    this.pointerUpSnapRadius = options.pointerUpSnapRadius;
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
    if (event.button !== 0 || isGpuScenePortConnectionDisabled(this.disabled)) {
      return;
    }
    const hit = hitTestGpuScenePortConnection({
      event,
      getScene: this.getScene,
      hitRadiusPx: this.hitRadiusPx,
      store: this.store,
    });
    if (!hit) {
      return;
    }
    preventGpuScenePortConnectionEvent(event);
    handlePointerDown({
      autoPanInsetsPx: this.autoPanInsetsPx,
      edgeUpdaterType: hit.start.type,
      event,
      getScene: this.getScene,
      handleId: hit.start.handleId,
      isConnectionCandidateAllowed: (candidate) =>
        this.isConnectionCandidateAllowed?.(candidate, hit.start) ?? true,
      isTarget:
        (hit.start.connectionStartSemanticType ?? hit.start.type) === "target",
      isValidConnection: (connection) =>
        this.isValidConnection(connection, hit.start),
      layoutStore: this.layoutStore,
      nodeId: hit.start.ownerSectionId,
      onConnect: (connection, context) =>
        this.onConnect(connection, context, hit.start),
      pointerUpSnapRadius: this.pointerUpSnapRadius,
      store: this.store,
    });
  };
}

function isGpuScenePortConnectionHitAbove(
  hit: GpuScenePortConnectionHit,
  current: GpuScenePortConnectionHit,
): boolean {
  if (hit.zIndex !== current.zIndex) {
    return hit.zIndex > current.zIndex;
  }
  return hit.distance < current.distance;
}

function resolveGpuScenePortHitRadius(
  hitRadiusPx: number,
  zoom: number,
): number {
  if (!Number.isFinite(hitRadiusPx) || hitRadiusPx < 0) {
    throw new Error("GPU scene port hit radius must be non-negative.");
  }
  return hitRadiusPx / zoom;
}

function isGpuScenePortConnectionDisabled(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function preventGpuScenePortConnectionEvent(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
