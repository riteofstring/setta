import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "gpuFlow/animationFrame";
import type { GpuNodeLayout } from "gpuFlow/htmlSurfaces/frame";
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

type ObservedProjectNode = {
  element: HTMLElement;
  mutationObserver: MutationObserver | null;
};

type ProjectNodeIntrinsicSizeController = {
  disconnect(): void;
  markNodesDirty(nodeIds: Iterable<string>): void;
  setNodeElement(nodeId: string, element: HTMLElement | null): void;
};

type ProjectNodeIntrinsicSizeControllerOptions = {
  ResizeObserver?: typeof ResizeObserver | undefined;
  cancelAnimationFrame?: typeof cancelGpuAnimationFrame | undefined;
  requestAnimationFrame?: typeof requestGpuAnimationFrame | undefined;
};

export function useProjectNodeIntrinsicSizeObserver(
  nodeLayouts: readonly GpuNodeLayout[],
) {
  const controllerRef = useRef<ProjectNodeIntrinsicSizeController | null>(null);
  const getController = useCallback(() => {
    controllerRef.current ??= createProjectNodeIntrinsicSizeController();
    return controllerRef.current;
  }, []);

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
  options: ProjectNodeIntrinsicSizeControllerOptions = {},
): ProjectNodeIntrinsicSizeController {
  const ResizeObserverCtor = options.ResizeObserver ?? globalThis.ResizeObserver;
  if (typeof ResizeObserverCtor !== "function") {
    throw new Error("Setta GPU section auto sizing requires ResizeObserver.");
  }
  const requestAnimationFrameFn =
    options.requestAnimationFrame ?? requestGpuAnimationFrame;
  const cancelAnimationFrameFn =
    options.cancelAnimationFrame ?? cancelGpuAnimationFrame;
  const observedNodes = new Map<string, ObservedProjectNode>();
  const elementNodeIds = new Map<HTMLElement, string>();
  const dirtyNodeIds = new Set<string>();
  let frameId: number | null = null;

  const resizeObserver = new ResizeObserverCtor((entries) => {
    for (const entry of entries) {
      const nodeId = elementNodeIds.get(entry.target as HTMLElement);
      if (nodeId) {
        markNodeDirty(nodeId);
      }
    }
  });

  function markNodeDirty(nodeId: string) {
    dirtyNodeIds.add(nodeId);
    if (frameId !== null) {
      return;
    }
    frameId = requestAnimationFrameFn(() => {
      frameId = null;
      flushDirtyNodes();
    });
  }

  function flushDirtyNodes() {
    const nodeIds = Array.from(dirtyNodeIds);
    dirtyNodeIds.clear();
    const updates: Array<ProjectNodeIntrinsicSize & { id: string }> = [];
    for (const nodeId of nodeIds) {
      const observed = observedNodes.get(nodeId);
      if (!observed) {
        continue;
      }
      const size = resolveProjectNodeIntrinsicSize(nodeId, observed.element);
      if (size) {
        updates.push({ id: nodeId, ...size });
      }
    }
    if (updates.length > 0) {
      updateNodeDimensionsFromGpuIntrinsicSizes(updates);
    }
  }

  function disconnectNode(nodeId: string) {
    const observed = observedNodes.get(nodeId);
    if (!observed) {
      return;
    }
    resizeObserver.unobserve(observed.element);
    observed.mutationObserver?.disconnect();
    elementNodeIds.delete(observed.element);
    observedNodes.delete(nodeId);
    dirtyNodeIds.delete(nodeId);
  }

  return {
    disconnect() {
      if (frameId !== null) {
        cancelAnimationFrameFn(frameId);
        frameId = null;
      }
      for (const nodeId of Array.from(observedNodes.keys())) {
        disconnectNode(nodeId);
      }
      resizeObserver.disconnect();
      dirtyNodeIds.clear();
    },
    markNodesDirty(nodeIds) {
      for (const nodeId of nodeIds) {
        if (observedNodes.has(nodeId)) {
          markNodeDirty(nodeId);
        }
      }
    },
    setNodeElement(nodeId, element) {
      disconnectNode(nodeId);
      if (!element) {
        return;
      }
      const mutationObserver = createIntrinsicSizeMutationObserver(
        element,
        () => markNodeDirty(nodeId),
      );
      observedNodes.set(nodeId, { element, mutationObserver });
      elementNodeIds.set(element, nodeId);
      resizeObserver.observe(element);
      markNodeDirty(nodeId);
    },
  };
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

function createIntrinsicSizeMutationObserver(
  element: HTMLElement,
  onMutation: () => void,
): MutationObserver | null {
  if (typeof globalThis.MutationObserver !== "function") {
    return null;
  }
  const observer = new MutationObserver(onMutation);
  observer.observe(element, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  return observer;
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
