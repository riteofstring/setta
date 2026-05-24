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
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuRetainedContentPortAnchor } from "../retainedContentScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";
import {
  hitTestGpuRetainedContentInteraction,
  shouldPreserveGpuRetainedContentNativeTarget,
  type GpuRetainedContentInteractionHit,
} from "./retainedContentInteraction";

type GpuRetainedContentConnectionStart = {
  readonly handleId: string;
  readonly ownerSectionId: string;
  readonly surfaceId: string;
  readonly type: HandleType;
};

type GpuRetainedContentConnectionHit = GpuRetainedContentInteractionHit & {
  readonly anchor: GpuRetainedContentPortAnchor;
  readonly start: GpuRetainedContentConnectionStart;
};

export type GpuRetainedContentConnectionOptions = {
  readonly autoPanInsetsPx?: GpuFlowAutoPanInsetsInput;
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly isConnectionCandidateAllowed?:
    | ((
        candidate: HandleConnectionCandidate,
        start: GpuRetainedContentConnectionStart,
      ) => boolean)
    | undefined;
  readonly isValidConnection?: ValidConnectionFunc | undefined;
  readonly onConnect: (
    connection: Connection,
    context?: GpuFlowConnectionContext,
  ) => void;
  readonly pointerUpSnapRadius?: number | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

export type GpuRetainedContentConnectionControllerOptions =
  GpuRetainedContentConnectionOptions & {
    readonly element: HTMLElement;
    readonly getRetainedRuntimeFrame?:
      | (() => GpuRetainedRuntimeFrame | null | undefined)
      | undefined;
    readonly getVisibleProjectionState?:
      | (() => GpuFlowVisibleProjectionState | null | undefined)
      | undefined;
    readonly getScene: () => GpuFlowScene | null | undefined;
    readonly layoutStore: GpuFlowLayoutStoreApi;
  };

const alwaysValidConnection: ValidConnectionFunc = () => true;

export function attachGpuRetainedContentConnectionController(
  options: GpuRetainedContentConnectionControllerOptions,
): () => void {
  const controller = new GpuRetainedContentConnectionController(options);
  controller.attach();
  return () => controller.destroy();
}

export function hitTestGpuRetainedContentConnection({
  element,
  event,
  getRetainedRuntimeFrame,
  getVisibleProjectionState,
  getScene,
  store = gpuFlowViewportStore,
}: {
  readonly element?: HTMLElement | undefined;
  readonly event: Pick<PointerEvent, "clientX" | "clientY" | "target">;
  readonly getRetainedRuntimeFrame?:
    | (() => GpuRetainedRuntimeFrame | null | undefined)
    | undefined;
  readonly getVisibleProjectionState?:
    | (() => GpuFlowVisibleProjectionState | null | undefined)
    | undefined;
  readonly getScene: () => GpuFlowScene | null | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
}): GpuRetainedContentConnectionHit | null {
  if (shouldPreserveGpuRetainedContentNativeTarget(event)) {
    return null;
  }
  const hit = hitTestGpuRetainedContentInteraction({
    element,
    event,
    getRetainedRuntimeFrame,
    getVisibleProjectionState,
    getScene: () => getScene() ?? undefined,
    store,
  });
  if (!hit || hit.hit.kind !== "port") {
    return null;
  }
  const anchor = hit.retainedScene.portAnchors.find(
    (candidate) =>
      candidate.ownerRowId === hit.hit.ownerRowId &&
      `port:${candidate.id}` === hit.hit.id,
  );
  if (!anchor) {
    throw new Error(
      `Missing GPU retained content port anchor for hit ${hit.hit.id}.`,
    );
  }
  const type = getGpuRetainedContentConnectionHandleType(anchor);
  return {
    ...hit,
    anchor,
    start: {
      handleId: anchor.id,
      ownerSectionId: hit.ownerSectionId,
      surfaceId: hit.surfaceId,
      type,
    },
  };
}

class GpuRetainedContentConnectionController {
  private readonly autoPanInsetsPx: GpuFlowAutoPanInsetsInput;
  private readonly disabled: boolean | (() => boolean) | undefined;
  private readonly element: HTMLElement;
  private readonly getRetainedRuntimeFrame:
    | (() => GpuRetainedRuntimeFrame | null | undefined)
    | undefined;
  private readonly getVisibleProjectionState:
    | (() => GpuFlowVisibleProjectionState | null | undefined)
    | undefined;
  private readonly getScene: () => GpuFlowScene | null | undefined;
  private readonly isConnectionCandidateAllowed:
    | ((
        candidate: HandleConnectionCandidate,
        start: GpuRetainedContentConnectionStart,
      ) => boolean)
    | undefined;
  private readonly isValidConnection: ValidConnectionFunc;
  private readonly layoutStore: GpuFlowLayoutStoreApi;
  private readonly onConnect: (
    connection: Connection,
    context?: GpuFlowConnectionContext,
  ) => void;
  private readonly pointerUpSnapRadius: number | undefined;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuRetainedContentConnectionControllerOptions) {
    this.autoPanInsetsPx = options.autoPanInsetsPx;
    this.disabled = options.disabled;
    this.element = options.element;
    this.getRetainedRuntimeFrame = options.getRetainedRuntimeFrame;
    this.getVisibleProjectionState = options.getVisibleProjectionState;
    this.getScene = options.getScene;
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
    if (
      event.button !== 0 ||
      isGpuRetainedContentConnectionDisabled(this.disabled)
    ) {
      return;
    }
    const hit = hitTestGpuRetainedContentConnection({
      element: this.element,
      event,
      getRetainedRuntimeFrame: this.getRetainedRuntimeFrame,
      getVisibleProjectionState: this.getVisibleProjectionState,
      getScene: this.getScene,
      store: this.store,
    });
    if (!hit) {
      return;
    }
    preventGpuRetainedContentConnectionEvent(event);
    handlePointerDown({
      autoPanInsetsPx: this.autoPanInsetsPx,
      edgeUpdaterType: hit.start.type,
      event,
      getScene: this.getScene,
      handleId: hit.start.handleId,
      isConnectionCandidateAllowed: (candidate) =>
        this.isConnectionCandidateAllowed?.(candidate, hit.start) ?? true,
      isTarget: hit.start.type === "target",
      isValidConnection: this.isValidConnection,
      layoutStore: this.layoutStore,
      nodeId: hit.start.ownerSectionId,
      onConnect: this.onConnect,
      pointerUpSnapRadius: this.pointerUpSnapRadius,
      store: this.store,
    });
  };
}

function getGpuRetainedContentConnectionHandleType(
  anchor: Pick<GpuRetainedContentPortAnchor, "kind">,
): HandleType {
  return anchor.kind === "input" ? "target" : "source";
}

function isGpuRetainedContentConnectionDisabled(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function preventGpuRetainedContentConnectionEvent(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
