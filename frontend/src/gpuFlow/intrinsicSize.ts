import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "./animationFrame";
import type {
  GpuFlowLayoutChange,
  GpuFlowLayoutNode,
  GpuFlowLayoutNodePatch,
  GpuFlowLayoutStoreApi,
} from "./layoutStore";

type GpuFlowIntrinsicSize = {
  readonly height?: number | undefined;
  readonly width?: number | undefined;
};

type GpuFlowIntrinsicSizeUpdate = GpuFlowIntrinsicSize & {
  readonly nodeId: string;
};

type GpuFlowIntrinsicSizeResolverInput = {
  readonly element: HTMLElement;
  readonly layoutNode: GpuFlowLayoutNode;
  readonly nodeId: string;
};

type GpuFlowIntrinsicSizeFlush = {
  readonly change: GpuFlowLayoutChange;
  readonly updates: readonly GpuFlowIntrinsicSizeUpdate[];
};

export type GpuFlowIntrinsicSizeController = {
  disconnect(): void;
  markNodesDirty(nodeIds: Iterable<string>): void;
  setNodeElement(nodeId: string, element: HTMLElement | null): void;
};

export type GpuFlowIntrinsicSizeControllerOptions = {
  readonly ResizeObserver?: typeof ResizeObserver | undefined;
  readonly cancelAnimationFrame?: typeof cancelGpuAnimationFrame | undefined;
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly MutationObserver?: typeof MutationObserver | undefined;
  readonly onIntrinsicSizesApplied?:
    | ((flush: GpuFlowIntrinsicSizeFlush) => void)
    | undefined;
  readonly requestAnimationFrame?: typeof requestGpuAnimationFrame | undefined;
  readonly resolveIntrinsicSize: (
    input: GpuFlowIntrinsicSizeResolverInput,
  ) => GpuFlowIntrinsicSize | null | undefined;
};

type ObservedGpuFlowIntrinsicNode = {
  readonly element: HTMLElement;
  readonly mutationObserver: MutationObserver | null;
};

export function createGpuFlowIntrinsicSizeController({
  layoutStore,
  onIntrinsicSizesApplied,
  resolveIntrinsicSize,
  ...options
}: GpuFlowIntrinsicSizeControllerOptions): GpuFlowIntrinsicSizeController {
  const ResizeObserverCtor =
    options.ResizeObserver ?? globalThis.ResizeObserver;
  if (typeof ResizeObserverCtor !== "function") {
    throw new Error("GpuFlow intrinsic auto sizing requires ResizeObserver.");
  }
  const requestAnimationFrameFn =
    options.requestAnimationFrame ?? requestGpuAnimationFrame;
  const cancelAnimationFrameFn =
    options.cancelAnimationFrame ?? cancelGpuAnimationFrame;
  const observedNodes = new Map<string, ObservedGpuFlowIntrinsicNode>();
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
    const updates: GpuFlowIntrinsicSizeUpdate[] = [];
    const patches: GpuFlowLayoutNodePatch[] = [];
    for (const nodeId of nodeIds) {
      const observed = observedNodes.get(nodeId);
      const layoutNode = layoutStore.getState().getNode(nodeId);
      if (!observed || !layoutNode) {
        continue;
      }
      const size = resolveIntrinsicSize({
        element: observed.element,
        layoutNode,
        nodeId,
      });
      const update = normalizeGpuFlowIntrinsicSizeUpdate(nodeId, size);
      if (!update) {
        continue;
      }
      updates.push(update);
      patches.push(update);
    }
    if (updates.length === 0) {
      return;
    }
    const change = layoutStore.getState().patchNodes(patches, {
      phase: "commit",
      reason: "intrinsic-size",
    });
    onIntrinsicSizesApplied?.({ change, updates });
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
      const mutationObserver = createGpuFlowIntrinsicSizeMutationObserver(
        element,
        () => markNodeDirty(nodeId),
        options.MutationObserver,
      );
      observedNodes.set(nodeId, { element, mutationObserver });
      elementNodeIds.set(element, nodeId);
      resizeObserver.observe(element);
      markNodeDirty(nodeId);
    },
  };
}

function createGpuFlowIntrinsicSizeMutationObserver(
  element: HTMLElement,
  onMutation: () => void,
  MutationObserverCtor = globalThis.MutationObserver,
): MutationObserver | null {
  if (typeof MutationObserverCtor !== "function") {
    return null;
  }
  const observer = new MutationObserverCtor(onMutation);
  observer.observe(element, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  return observer;
}

function normalizeGpuFlowIntrinsicSizeUpdate(
  nodeId: string,
  size: GpuFlowIntrinsicSize | null | undefined,
): GpuFlowIntrinsicSizeUpdate | null {
  if (!size) {
    return null;
  }
  const update: {
    height?: number | undefined;
    nodeId: string;
    width?: number;
  } = {
    nodeId,
  };
  if (size.height !== undefined) {
    assertFinitePositiveDimension(
      `intrinsic node ${nodeId} height`,
      size.height,
    );
    update.height = size.height;
  }
  if (size.width !== undefined) {
    assertFinitePositiveDimension(`intrinsic node ${nodeId} width`, size.width);
    update.width = size.width;
  }
  return update.height === undefined && update.width === undefined
    ? null
    : update;
}

function assertFinitePositiveDimension(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}
