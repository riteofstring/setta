import { subscribeWithSelector } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  gpuViewportToTuple,
  normalizeGpuViewport,
  type GpuPoint,
  type GpuRect,
  type GpuViewport,
  type GpuViewportInput,
  type GpuViewportTuple,
} from "./viewportMath";

export type GpuUserSelectionRect = GpuRect & {
  readonly startX: number;
  readonly startY: number;
};

type GpuViewportInteractionFlags = {
  readonly panScrolling?: boolean | undefined;
  readonly paneDragging?: boolean | undefined;
  readonly pointerPanning?: boolean | undefined;
  readonly wheelZooming?: boolean | undefined;
};

type GpuFlowViewportStoreState = {
  readonly defaultZoom: number;
  readonly domNode: HTMLElement | null;
  readonly height: number;
  readonly maxZoom: number;
  readonly minZoom: number;
  readonly multiSelectionActive: boolean;
  readonly nodesSelectionBounds: GpuRect | null;
  readonly panScrolling: boolean;
  readonly paneDragging: boolean;
  readonly pointerPanning: boolean;
  readonly selectionKeyPressed: boolean;
  readonly transform: GpuViewportTuple;
  readonly viewportInteractionActive: boolean;
  readonly wheelZooming: boolean;
  readonly width: number;
  readonly userSelectionActive: boolean;
  readonly userSelectionRect: GpuUserSelectionRect | null;
};

type GpuFlowViewportStoreActions = {
  clearDomNode(domNode: HTMLElement): void;
  getViewport(): GpuViewport;
  setDomNode(domNode: HTMLElement | null): void;
  setMultiSelectionActive(active: boolean): void;
  setNodesSelectionBounds(bounds: GpuRect | null): void;
  setSelectionKeyPressed(pressed: boolean): void;
  setTransform(viewport: GpuViewportInput): boolean;
  setUserSelection(input: {
    readonly active: boolean;
    readonly rect: GpuUserSelectionRect | null;
  }): void;
  setViewportInteractionFlags(flags: GpuViewportInteractionFlags): void;
  setViewportSize(size: {
    readonly height: number;
    readonly width: number;
  }): void;
  setZoomBounds(bounds: {
    readonly defaultZoom?: number | undefined;
    readonly maxZoom?: number | undefined;
    readonly minZoom?: number | undefined;
  }): void;
  resetUserSelection(): void;
};

type GpuFlowViewportStore = GpuFlowViewportStoreState &
  GpuFlowViewportStoreActions;

export type GpuFlowViewportStoreApi = StoreApi<GpuFlowViewportStore>;

type CreateGpuFlowViewportStoreOptions = Partial<
  Pick<
    GpuFlowViewportStoreState,
    "defaultZoom" | "height" | "maxZoom" | "minZoom" | "transform" | "width"
  >
>;

type MutableGpuFlowViewportStoreState = {
  -readonly [Key in keyof GpuFlowViewportStoreState]?: GpuFlowViewportStoreState[Key];
};

const DEFAULT_GPU_VIEWPORT_STORE_STATE = {
  defaultZoom: 1,
  domNode: null,
  height: 0,
  maxZoom: 4,
  minZoom: 0.1,
  multiSelectionActive: false,
  nodesSelectionBounds: null,
  panScrolling: false,
  paneDragging: false,
  pointerPanning: false,
  selectionKeyPressed: false,
  transform: [0, 0, 1] as GpuViewportTuple,
  userSelectionActive: false,
  userSelectionRect: null,
  viewportInteractionActive: false,
  wheelZooming: false,
  width: 0,
} satisfies GpuFlowViewportStoreState;

export function createGpuFlowViewportStore(
  options: CreateGpuFlowViewportStoreOptions = {},
): GpuFlowViewportStoreApi {
  return createStore<GpuFlowViewportStore>()(
    subscribeWithSelector((set, get) => ({
      ...DEFAULT_GPU_VIEWPORT_STORE_STATE,
      ...normalizeInitialViewportStoreOptions(options),
      clearDomNode(domNode) {
        set((state) => (state.domNode === domNode ? { domNode: null } : state));
      },
      getViewport() {
        return normalizeGpuViewport(get().transform);
      },
      resetUserSelection() {
        set((state) =>
          state.userSelectionActive || state.userSelectionRect
            ? {
                userSelectionActive: false,
                userSelectionRect: null,
              }
            : state,
        );
      },
      setDomNode(domNode) {
        set((state) => (state.domNode === domNode ? state : { domNode }));
      },
      setMultiSelectionActive(active) {
        set((state) =>
          state.multiSelectionActive === active
            ? state
            : { multiSelectionActive: active },
        );
      },
      setNodesSelectionBounds(bounds) {
        const nextBounds = normalizeOptionalGpuRect(
          "nodes selection bounds",
          bounds,
        );
        set((state) =>
          areOptionalGpuRectsEqual(state.nodesSelectionBounds, nextBounds)
            ? state
            : { nodesSelectionBounds: nextBounds },
        );
      },
      setSelectionKeyPressed(pressed) {
        set((state) =>
          state.selectionKeyPressed === pressed
            ? state
            : { selectionKeyPressed: pressed },
        );
      },
      setTransform(viewport) {
        const transform = gpuViewportToTuple(viewport);
        let changed = false;
        set((state) => {
          if (areGpuViewportTuplesEqual(state.transform, transform)) {
            return state;
          }
          changed = true;
          return { transform };
        });
        return changed;
      },
      setUserSelection(input) {
        const rect = normalizeOptionalUserSelectionRect(input.rect);
        set((state) => {
          if (
            state.userSelectionActive === input.active &&
            areOptionalUserSelectionRectsEqual(state.userSelectionRect, rect)
          ) {
            return state;
          }
          return {
            userSelectionActive: input.active,
            userSelectionRect: rect,
          };
        });
      },
      setViewportInteractionFlags(flags) {
        set((state) => {
          const nextState = resolveGpuViewportInteractionState(state, flags);
          return areGpuViewportInteractionStatesEqual(state, nextState)
            ? state
            : nextState;
        });
      },
      setViewportSize(size) {
        assertFiniteNonNegative("viewport width", size.width);
        assertFiniteNonNegative("viewport height", size.height);
        set((state) =>
          state.width === size.width && state.height === size.height
            ? state
            : { height: size.height, width: size.width },
        );
      },
      setZoomBounds(bounds) {
        const minZoom = bounds.minZoom ?? get().minZoom;
        const maxZoom = bounds.maxZoom ?? get().maxZoom;
        const defaultZoom = bounds.defaultZoom ?? get().defaultZoom;
        assertFinitePositive("minimum zoom", minZoom);
        assertFinitePositive("maximum zoom", maxZoom);
        assertFinitePositive("default zoom", defaultZoom);
        if (minZoom > maxZoom) {
          throw new Error(
            "minimum zoom must be less than or equal to maximum zoom.",
          );
        }
        set((state) => {
          if (
            state.defaultZoom === defaultZoom &&
            state.maxZoom === maxZoom &&
            state.minZoom === minZoom
          ) {
            return state;
          }
          return { defaultZoom, maxZoom, minZoom };
        });
      },
    })),
  );
}

export const gpuFlowViewportStore = createGpuFlowViewportStore();

export function getGpuViewportStorePointRelativeToDomNode(
  point: GpuPoint,
  store: GpuFlowViewportStoreApi = gpuFlowViewportStore,
): GpuPoint {
  const domNode = store.getState().domNode;
  if (!domNode) {
    return point;
  }
  const rect = domNode.getBoundingClientRect();
  return {
    x: point.x - rect.left,
    y: point.y - rect.top,
  };
}

function normalizeInitialViewportStoreOptions(
  options: CreateGpuFlowViewportStoreOptions,
): MutableGpuFlowViewportStoreState {
  const normalizedOptions: MutableGpuFlowViewportStoreState = {};
  if (options.transform) {
    normalizedOptions.transform = gpuViewportToTuple(options.transform);
  }
  if (options.width !== undefined) {
    assertFiniteNonNegative("viewport width", options.width);
    normalizedOptions.width = options.width;
  }
  if (options.height !== undefined) {
    assertFiniteNonNegative("viewport height", options.height);
    normalizedOptions.height = options.height;
  }
  if (options.minZoom !== undefined) {
    assertFinitePositive("minimum zoom", options.minZoom);
    normalizedOptions.minZoom = options.minZoom;
  }
  if (options.maxZoom !== undefined) {
    assertFinitePositive("maximum zoom", options.maxZoom);
    normalizedOptions.maxZoom = options.maxZoom;
  }
  if (options.defaultZoom !== undefined) {
    assertFinitePositive("default zoom", options.defaultZoom);
    normalizedOptions.defaultZoom = options.defaultZoom;
  }
  return normalizedOptions;
}

function areGpuViewportTuplesEqual(
  left: GpuViewportTuple,
  right: GpuViewportTuple,
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function normalizeOptionalGpuRect(
  name: string,
  rect: GpuRect | null,
): GpuRect | null {
  if (!rect) {
    return null;
  }
  assertFiniteNumber(`${name} x`, rect.x);
  assertFiniteNumber(`${name} y`, rect.y);
  assertFiniteNonNegative(`${name} width`, rect.width);
  assertFiniteNonNegative(`${name} height`, rect.height);
  return {
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

function normalizeOptionalUserSelectionRect(
  rect: GpuUserSelectionRect | null,
): GpuUserSelectionRect | null {
  const normalizedRect = normalizeOptionalGpuRect("user selection rect", rect);
  if (!normalizedRect || !rect) {
    return null;
  }
  assertFiniteNumber("user selection start x", rect.startX);
  assertFiniteNumber("user selection start y", rect.startY);
  return {
    ...normalizedRect,
    startX: rect.startX,
    startY: rect.startY,
  };
}

function areOptionalGpuRectsEqual(
  left: GpuRect | null,
  right: GpuRect | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}

function areOptionalUserSelectionRectsEqual(
  left: GpuUserSelectionRect | null,
  right: GpuUserSelectionRect | null,
): boolean {
  if (!areOptionalGpuRectsEqual(left, right)) {
    return false;
  }
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.startX === right.startX && left.startY === right.startY;
}

function resolveGpuViewportInteractionState(
  state: GpuFlowViewportStoreState,
  flags: GpuViewportInteractionFlags,
): Pick<
  GpuFlowViewportStoreState,
  | "panScrolling"
  | "paneDragging"
  | "pointerPanning"
  | "viewportInteractionActive"
  | "wheelZooming"
> {
  const panScrolling = flags.panScrolling ?? state.panScrolling;
  const paneDragging = flags.paneDragging ?? state.paneDragging;
  const pointerPanning = flags.pointerPanning ?? state.pointerPanning;
  const wheelZooming = flags.wheelZooming ?? state.wheelZooming;
  return {
    panScrolling,
    paneDragging,
    pointerPanning,
    viewportInteractionActive: panScrolling || pointerPanning || wheelZooming,
    wheelZooming,
  };
}

function areGpuViewportInteractionStatesEqual(
  left: Pick<
    GpuFlowViewportStoreState,
    | "panScrolling"
    | "paneDragging"
    | "pointerPanning"
    | "viewportInteractionActive"
    | "wheelZooming"
  >,
  right: Pick<
    GpuFlowViewportStoreState,
    | "panScrolling"
    | "paneDragging"
    | "pointerPanning"
    | "viewportInteractionActive"
    | "wheelZooming"
  >,
): boolean {
  return (
    left.panScrolling === right.panScrolling &&
    left.paneDragging === right.paneDragging &&
    left.pointerPanning === right.pointerPanning &&
    left.viewportInteractionActive === right.viewportInteractionActive &&
    left.wheelZooming === right.wheelZooming
  );
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function assertFiniteNumber(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}

function assertFinitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}
