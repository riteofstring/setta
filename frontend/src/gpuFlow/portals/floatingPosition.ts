import {
  computePosition,
  flip,
  offset,
  shift,
  size,
  type Padding,
  type Placement,
  type ReferenceElement,
} from "@floating-ui/dom";

import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";

type GpuFloatingPositionStyle = {
  readonly left: string;
  readonly maxHeight?: string | undefined;
  readonly minWidth?: string | undefined;
  readonly opacity: number;
  readonly position: "fixed";
  readonly top: string;
};

type GpuFloatingPositionOptions = {
  readonly boundaryPadding?: Padding | undefined;
  readonly floating: HTMLElement;
  readonly matchReferenceWidth?: boolean | undefined;
  readonly maxHeight?: number | undefined;
  readonly offsetPx?: number | undefined;
  readonly onPosition: (style: GpuFloatingPositionStyle) => void;
  readonly placement?: Placement | undefined;
  readonly reference: ReferenceElement;
  readonly repositionOnGpuViewportTransform?: boolean | undefined;
  readonly viewportStore?: GpuFlowViewportStoreApi | undefined;
};

type GpuFloatingVirtualPoint = {
  readonly x: number;
  readonly y: number;
};

type GpuFloatingVirtualRect = GpuFloatingVirtualPoint & {
  readonly height: number;
  readonly width: number;
};

const DEFAULT_BOUNDARY_PADDING = 8;

export function createGpuFloatingVirtualPointReference({
  x,
  y,
}: GpuFloatingVirtualPoint): ReferenceElement {
  return createGpuFloatingVirtualRectReference({ height: 0, width: 0, x, y });
}

export function createGpuFloatingVirtualRectReference({
  height,
  width,
  x,
  y,
}: GpuFloatingVirtualRect): ReferenceElement {
  return {
    getBoundingClientRect: () =>
      createDomRect({ height, width, x, y }),
  };
}

export function autoUpdateGpuFloatingPosition(
  options: GpuFloatingPositionOptions,
): () => void {
  if (typeof window === "undefined") {
    return noop;
  }
  let rafId: number | null = null;
  let disposed = false;

  const scheduleUpdate = () => {
    if (rafId !== null || disposed) {
      return;
    }
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      void updateGpuFloatingPosition(options);
    });
  };

  scheduleUpdate();
  window.addEventListener("scroll", scheduleUpdate, true);
  window.addEventListener("resize", scheduleUpdate);
  const unsubscribeViewport = options.repositionOnGpuViewportTransform
    ? subscribeToGpuViewportTransform(
        options.viewportStore ?? gpuFlowViewportStore,
        scheduleUpdate,
      )
    : noop;

  return () => {
    disposed = true;
    unsubscribeViewport();
    window.removeEventListener("scroll", scheduleUpdate, true);
    window.removeEventListener("resize", scheduleUpdate);
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
  };
}

export async function updateGpuFloatingPosition({
  boundaryPadding = DEFAULT_BOUNDARY_PADDING,
  floating,
  matchReferenceWidth = false,
  maxHeight,
  offsetPx = 0,
  onPosition,
  placement = "bottom-start",
  reference,
}: GpuFloatingPositionOptions): Promise<void> {
  const { x, y } = await computePosition(reference, floating, {
    middleware: [
      offset(offsetPx),
      flip({ padding: boundaryPadding }),
      shift({ padding: boundaryPadding }),
      size({
        padding: boundaryPadding,
        apply({ availableHeight, elements, rects }) {
          if (matchReferenceWidth) {
            elements.floating.style.minWidth = `${rects.reference.width}px`;
          }
          if (maxHeight !== undefined) {
            elements.floating.style.maxHeight = `${Math.max(
              0,
              Math.min(maxHeight, availableHeight),
            )}px`;
          }
        },
      }),
    ],
    placement,
    strategy: "fixed",
  });

  onPosition({
    left: `${x}px`,
    ...(maxHeight !== undefined ? { maxHeight: floating.style.maxHeight } : {}),
    ...(matchReferenceWidth ? { minWidth: floating.style.minWidth } : {}),
    opacity: 1,
    position: "fixed",
    top: `${y}px`,
  });
}

function createDomRect({
  height,
  width,
  x,
  y,
}: GpuFloatingVirtualRect): DOMRect {
  return {
    bottom: y + height,
    height,
    left: x,
    right: x + width,
    top: y,
    width,
    x,
    y,
    toJSON: () => ({}),
  };
}

function subscribeToGpuViewportTransform(
  store: GpuFlowViewportStoreApi,
  onTransformChange: () => void,
) {
  let previousTransform = store.getState().transform;
  return store.subscribe((state) => {
    if (state.transform === previousTransform) {
      return;
    }
    previousTransform = state.transform;
    onTransformChange();
  });
}

function noop() {}
