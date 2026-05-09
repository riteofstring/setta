import {
  createGpuFlowIntrinsicSizeController,
  type GpuFlowIntrinsicSizeController,
  type GpuFlowIntrinsicSizeControllerOptions,
} from "gpuFlow/intrinsicSize";
import type {
  GpuFlowLayoutNode,
  GpuFlowLayoutStoreApi,
} from "gpuFlow/layoutStore";
import { useCallback, useEffect, useRef } from "react";
import { updateNodeDimensionsFromGpuIntrinsicSizes } from "state/actions/nodeInternals";
import { getEffectiveSectionImplIfPresent } from "state/actions/sectionInfos/projectStateCore";
import { toTopLevelSectionOuterDimension } from "state/actions/sectionInfos/topLevelSectionNode";
import { useProjectState } from "state/definitions";
import { getSectionMinMaxDims } from "state/hooks/sectionSizes";

type ProjectNodeIntrinsicSize = {
  height?: number | undefined;
  width?: number | undefined;
};

type ProjectNodeIntrinsicSizeController = GpuFlowIntrinsicSizeController;

type ProjectNodeIntrinsicSizeControllerOptions = {
  ResizeObserver?: typeof ResizeObserver | undefined;
  cancelAnimationFrame?: GpuFlowIntrinsicSizeControllerOptions["cancelAnimationFrame"];
  layoutStore: GpuFlowLayoutStoreApi;
  MutationObserver?: typeof MutationObserver | undefined;
  requestAnimationFrame?: GpuFlowIntrinsicSizeControllerOptions["requestAnimationFrame"];
};

export function useProjectNodeIntrinsicSizeObserver(
  layoutStore: GpuFlowLayoutStoreApi,
  nodeLayouts: readonly GpuFlowLayoutNode[],
) {
  const controllerRef = useRef<ProjectNodeIntrinsicSizeController | null>(null);
  const getController = useCallback(() => {
    controllerRef.current ??= createProjectNodeIntrinsicSizeController({
      layoutStore,
    });
    return controllerRef.current;
  }, [layoutStore]);

  useEffect(() => {
    controllerRef.current?.markNodesDirty(
      nodeLayouts.map((layout) => layout.nodeId),
    );
  }, [nodeLayouts]);

  useEffect(
    () => () => {
      controllerRef.current?.disconnect();
      controllerRef.current = null;
    },
    [],
  );

  return useCallback(
    (nodeId: string, element: HTMLElement | null) => {
      getController().setNodeElement(nodeId, element);
    },
    [getController],
  );
}

export function createProjectNodeIntrinsicSizeController(
  options: ProjectNodeIntrinsicSizeControllerOptions,
): ProjectNodeIntrinsicSizeController {
  return createGpuFlowIntrinsicSizeController({
    ResizeObserver: options.ResizeObserver,
    cancelAnimationFrame: options.cancelAnimationFrame,
    layoutStore: options.layoutStore,
    MutationObserver: options.MutationObserver,
    onIntrinsicSizesApplied: ({ updates }) => {
      updateNodeDimensionsFromGpuIntrinsicSizes(
        updates.map(({ nodeId, ...size }) => ({ id: nodeId, ...size })),
      );
    },
    requestAnimationFrame: options.requestAnimationFrame,
    resolveIntrinsicSize: ({ element, nodeId }) =>
      resolveProjectNodeIntrinsicSize(nodeId, element),
  });
}

export function resolveProjectNodeIntrinsicSize(
  nodeId: string,
  element: HTMLElement,
): ProjectNodeIntrinsicSize | null {
  const projectState = useProjectState.getState();
  const impl = getEffectiveSectionImplIfPresent(projectState, nodeId);
  if (!impl) {
    return null;
  }
  const autoHeight = impl.size.height === "auto";
  const autoWidth = impl.size.width === "auto";
  if (!autoHeight && !autoWidth) {
    return null;
  }

  const { maxHeight, maxWidth, minHeight, minWidth } =
    getSectionMinMaxDims(nodeId);
  const nextSize: ProjectNodeIntrinsicSize = {};
  if (autoHeight) {
    const outerMaxHeight = toTopLevelSectionOuterDimension(maxHeight);
    const outerMinHeight = toTopLevelSectionOuterDimension(minHeight);
    const height = clampMeasuredDimension(
      measureIntrinsicElementHeight(element, {
        maxHeight: outerMaxHeight,
        minHeight: outerMinHeight,
      }),
      outerMinHeight,
      outerMaxHeight,
    );
    if (height !== null) {
      nextSize.height = height;
    }
  }
  if (autoWidth) {
    const outerMaxWidth = toTopLevelSectionOuterDimension(maxWidth);
    const outerMinWidth = toTopLevelSectionOuterDimension(minWidth);
    const width = clampMeasuredDimension(
      measureIntrinsicElementWidth(element, {
        maxWidth: outerMaxWidth,
        minWidth: outerMinWidth,
      }),
      outerMinWidth,
      outerMaxWidth,
    );
    if (width !== null) {
      nextSize.width = width;
    }
  }
  return Object.keys(nextSize).length > 0 ? nextSize : null;
}

export function measureIntrinsicElementHeight(
  element: HTMLElement,
  {
    maxHeight,
    minHeight,
  }: { readonly maxHeight: number; readonly minHeight: number },
): number {
  const previousHeight = element.style.height;
  const previousMaxHeight = element.style.maxHeight;
  const previousMinHeight = element.style.minHeight;

  element.style.height = "";
  element.style.maxHeight = `${maxHeight}px`;
  element.style.minHeight = `${minHeight}px`;
  const height = Math.round(
    Math.max(element.offsetHeight, element.getBoundingClientRect().height),
  );
  element.style.height = previousHeight;
  element.style.maxHeight = previousMaxHeight;
  element.style.minHeight = previousMinHeight;
  return height;
}

export function measureIntrinsicElementWidth(
  element: HTMLElement,
  {
    maxWidth,
    minWidth,
  }: { readonly maxWidth: number; readonly minWidth: number },
): number {
  const previousMaxWidth = element.style.maxWidth;
  const previousMinWidth = element.style.minWidth;
  const previousWidth = element.style.width;

  element.style.maxWidth = `${maxWidth}px`;
  element.style.minWidth = `${minWidth}px`;
  element.style.width = "";
  const width = Math.round(
    Math.max(element.offsetWidth, element.getBoundingClientRect().width),
  );
  element.style.maxWidth = previousMaxWidth;
  element.style.minWidth = previousMinWidth;
  element.style.width = previousWidth;
  return width;
}

function clampMeasuredDimension(
  value: number,
  minValue: number,
  maxValue: number,
): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.min(Math.max(value, minValue), maxValue);
}
