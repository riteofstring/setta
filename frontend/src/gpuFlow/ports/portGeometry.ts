import { createWithEqualityFn } from "zustand/traditional";

import { HandlePosition, type HandleType } from "../flowTypes";
import type { GpuFlowLayoutNode } from "../layoutStore";
import type { GpuFlowScene } from "../scene";
import type { GpuPoint, GpuRect } from "../viewportMath";

export type GpuFlowPortDescriptor = {
  readonly element?: HTMLElement | null | undefined;
  readonly isConnectableEnd?: boolean | undefined;
  readonly isConnectableStart?: boolean | undefined;
  readonly localRect: GpuRect;
  readonly nodeId: string;
  readonly portId: string;
  readonly side: HandlePosition;
  readonly type: HandleType;
};

export type GpuFlowPortEndpoint = {
  readonly nodeId: string;
  readonly normal: GpuPoint;
  readonly portId: string;
  readonly side: HandlePosition;
  readonly type: HandleType;
  readonly x: number;
  readonly y: number;
};

export type GpuFlowPortRegistryState = {
  readonly descriptors: Readonly<Record<string, GpuFlowPortDescriptor>>;
  readonly version: number;
};

export type GpuFlowPortRegistryActions = {
  registerPort(descriptor: GpuFlowPortDescriptor): string;
  removePort(nodeId: string, portId: string, type: HandleType): void;
  reset(): void;
  updatePortLocalRect(key: string, localRect: GpuRect): void;
};

export type GpuFlowPortRegistry = GpuFlowPortRegistryState &
  GpuFlowPortRegistryActions;

export type BuildGpuFlowPortEndpointsInput = {
  readonly layoutNodes: readonly GpuFlowLayoutNode[];
  readonly ports: Readonly<Record<string, GpuFlowPortDescriptor>>;
};

export type RegisterGpuFlowPortsWithSharedElementInput = {
  readonly element: HTMLElement;
  readonly isConnectableEnd?: boolean | undefined;
  readonly isConnectableStart?: boolean | undefined;
  readonly nodeId: string;
  readonly portIds: readonly string[];
  readonly side: HandlePosition;
  readonly type: HandleType;
};

const GPU_FLOW_NODE_SOURCE_SELECTOR = '[data-gpu-flow-node="true"]';

export const useGpuFlowPortRegistry = createWithEqualityFn<GpuFlowPortRegistry>(
  (set, get) => ({
    descriptors: {},
    version: 0,
    registerPort(descriptor) {
      const key = makeGpuFlowPortKey(
        descriptor.nodeId,
        descriptor.portId,
        descriptor.type,
      );
      const normalized = normalizeGpuFlowPortDescriptor(descriptor);
      const current = get().descriptors[key];
      if (current && areGpuFlowPortDescriptorsEqual(current, normalized)) {
        return key;
      }
      set((state) => ({
        descriptors: {
          ...state.descriptors,
          [key]: normalized,
        },
        version: state.version + 1,
      }));
      return key;
    },
    removePort(nodeId, portId, type) {
      const key = makeGpuFlowPortKey(nodeId, portId, type);
      if (!get().descriptors[key]) {
        return;
      }
      set((state) => {
        const descriptors = { ...state.descriptors };
        delete descriptors[key];
        return {
          descriptors,
          version: state.version + 1,
        };
      });
    },
    reset() {
      set({ descriptors: {}, version: 0 });
    },
    updatePortLocalRect(key, localRect) {
      const descriptor = get().descriptors[key];
      if (!descriptor) {
        return;
      }
      const normalizedRect = normalizeGpuFlowPortLocalRect(localRect);
      if (areGpuRectsEqual(descriptor.localRect, normalizedRect)) {
        return;
      }
      set((state) => ({
        descriptors: {
          ...state.descriptors,
          [key]: {
            ...descriptor,
            localRect: normalizedRect,
          },
        },
        version: state.version + 1,
      }));
    },
  }),
);

export function makeGpuFlowPortKey(
  nodeId: string,
  portId: string,
  type: HandleType,
): string {
  return `${nodeId}:${portId}:${type}`;
}

export function registerGpuFlowPortDescriptor(
  descriptor: GpuFlowPortDescriptor,
): string {
  return useGpuFlowPortRegistry.getState().registerPort(descriptor);
}

export function unregisterGpuFlowPortDescriptor(
  nodeId: string,
  portId: string,
  type: HandleType,
): void {
  useGpuFlowPortRegistry.getState().removePort(nodeId, portId, type);
}

export function updateGpuFlowPortDescriptorLocalRect(
  key: string,
  localRect: GpuRect,
): void {
  useGpuFlowPortRegistry.getState().updatePortLocalRect(key, localRect);
}

export function getGpuFlowPortDescriptor({
  nodeId,
  portId,
  type,
}: {
  readonly nodeId: string;
  readonly portId: string;
  readonly type: HandleType;
}): GpuFlowPortDescriptor | null {
  return (
    useGpuFlowPortRegistry.getState().descriptors[
      makeGpuFlowPortKey(nodeId, portId, type)
    ] ?? null
  );
}

export function hasGpuFlowPortDescriptor({
  nodeId,
  portId,
  type,
}: {
  readonly nodeId: string;
  readonly portId: string;
  readonly type: HandleType;
}): boolean {
  return getGpuFlowPortDescriptor({ nodeId, portId, type }) !== null;
}

export function hasGpuFlowScenePortDescriptor({
  nodeId,
  portId,
  scene,
  type,
}: {
  readonly nodeId: string;
  readonly portId: string;
  readonly scene: GpuFlowScene | null | undefined;
  readonly type: HandleType;
}): boolean {
  if (!scene) {
    return false;
  }
  return (
    hasGpuFlowSectionScenePortDescriptor({ nodeId, portId, scene, type }) ||
    hasGpuFlowRetainedScenePortDescriptor({ nodeId, portId, scene, type })
  );
}

function hasGpuFlowSectionScenePortDescriptor({
  nodeId,
  portId,
  scene,
  type,
}: {
  readonly nodeId: string;
  readonly portId: string;
  readonly scene: GpuFlowScene;
  readonly type: HandleType;
}): boolean {
  return scene.sections.some(
    (section) =>
      section.sectionId === nodeId &&
      section.portAnchors.some(
        (anchor) =>
          anchor.id === portId &&
          getGpuFlowScenePortHandleType(anchor.kind) === type,
      ),
  );
}

function hasGpuFlowRetainedScenePortDescriptor({
  nodeId,
  portId,
  scene,
  type,
}: {
  readonly nodeId: string;
  readonly portId: string;
  readonly scene: GpuFlowScene;
  readonly type: HandleType;
}): boolean {
  return scene.contentSurfaces.some((surface) =>
    hasGpuFlowRetainedSurfacePortDescriptor({ nodeId, portId, surface, type }),
  );
}

function hasGpuFlowRetainedSurfacePortDescriptor({
  nodeId,
  portId,
  surface,
  type,
}: {
  readonly nodeId: string;
  readonly portId: string;
  readonly surface: GpuFlowScene["contentSurfaces"][number];
  readonly type: HandleType;
}): boolean {
  const retainedScene = surface.retainedScene;
  return Boolean(
    surface.ownerSectionId === nodeId &&
      surface.renderer.kind === "canvas-content" &&
      retainedScene?.portAnchors.some(
        (anchor) =>
          anchor.id === portId &&
          getGpuFlowScenePortHandleType(anchor.kind) === type,
      ),
  );
}

export function registerGpuFlowPortsWithSharedElement({
  element,
  isConnectableEnd,
  isConnectableStart,
  nodeId,
  portIds,
  side,
  type,
}: RegisterGpuFlowPortsWithSharedElementInput): readonly string[] {
  if (portIds.length === 0) {
    return [];
  }
  const localRect = measureGpuFlowPortElementLocalRect(element);
  if (!localRect) {
    return [];
  }
  return portIds.map((portId) =>
    registerGpuFlowPortDescriptor({
      element,
      isConnectableEnd,
      isConnectableStart,
      localRect,
      nodeId,
      portId,
      side,
      type,
    }),
  );
}

let pendingPortLocalRectFrame: number | null = null;
const pendingPortLocalRectNodeIds = new Set<string>();

export function scheduleGpuFlowPortLocalRectUpdate(
  nodeIds: readonly string[],
): void {
  if (nodeIds.length === 0) {
    return;
  }
  for (const nodeId of nodeIds) {
    pendingPortLocalRectNodeIds.add(nodeId);
  }
  if (pendingPortLocalRectFrame !== null) {
    return;
  }
  pendingPortLocalRectFrame = requestAnimationFrame(() => {
    pendingPortLocalRectFrame = null;
    const nextNodeIds = Array.from(pendingPortLocalRectNodeIds);
    pendingPortLocalRectNodeIds.clear();
    updateGpuFlowPortLocalRectsForNodes(nextNodeIds);
  });
}

export function updateGpuFlowPortLocalRectsForNodes(
  nodeIds: readonly string[],
): void {
  if (nodeIds.length === 0) {
    return;
  }
  const nodeIdSet = new Set(nodeIds);
  const descriptors = useGpuFlowPortRegistry.getState().descriptors;
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!nodeIdSet.has(descriptor.nodeId) || !descriptor.element) {
      continue;
    }
    const localRect = measureGpuFlowPortElementLocalRect(descriptor.element);
    if (localRect) {
      updateGpuFlowPortDescriptorLocalRect(key, localRect);
    }
  }
}

export function measureGpuFlowPortElementLocalRect(
  element: HTMLElement,
): GpuRect | null {
  const sourceElement = getGpuFlowPortSourceElement(element);
  if (!sourceElement) {
    return null;
  }
  return getElementLocalRectWithinSource(element, sourceElement);
}

export function buildGpuFlowPortEndpoints({
  layoutNodes,
  ports,
}: BuildGpuFlowPortEndpointsInput): Readonly<
  Record<string, GpuFlowPortEndpoint>
> {
  const nodesById = new Map(layoutNodes.map((node) => [node.nodeId, node]));
  const endpoints: Record<string, GpuFlowPortEndpoint> = {};
  for (const [key, descriptor] of Object.entries(ports)) {
    const node = nodesById.get(descriptor.nodeId);
    if (!node) {
      continue;
    }
    endpoints[key] = getGpuFlowPortEndpoint(descriptor, node);
  }
  return endpoints;
}

export function getGpuFlowPortEndpoint(
  descriptor: GpuFlowPortDescriptor,
  node: Pick<GpuFlowLayoutNode, "nodeId" | "x" | "y">,
): GpuFlowPortEndpoint {
  if (descriptor.nodeId !== node.nodeId) {
    throw new Error(
      `Port ${descriptor.portId} belongs to ${descriptor.nodeId}, not ${node.nodeId}.`,
    );
  }
  const localRect = normalizeGpuFlowPortLocalRect(descriptor.localRect);
  return {
    nodeId: descriptor.nodeId,
    normal: getGpuFlowPortSideNormal(descriptor.side),
    portId: descriptor.portId,
    side: descriptor.side,
    type: descriptor.type,
    x: node.x + localRect.x + localRect.width / 2,
    y: node.y + localRect.y + localRect.height / 2,
  };
}

function getGpuFlowPortSourceElement(element: HTMLElement): HTMLElement | null {
  const sourceElement = element.closest(GPU_FLOW_NODE_SOURCE_SELECTOR);
  return sourceElement instanceof HTMLElement ? sourceElement : null;
}

function getElementLocalRectWithinSource(
  element: HTMLElement,
  sourceElement: HTMLElement,
): GpuRect | null {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = element;
  const visited = new Set<HTMLElement>();

  while (current && current !== sourceElement) {
    if (visited.has(current)) {
      return null;
    }
    visited.add(current);
    x += current.offsetLeft;
    y += current.offsetTop;
    const offsetParent = current.offsetParent;
    current =
      offsetParent instanceof HTMLElement &&
      sourceElement.contains(offsetParent)
        ? offsetParent
        : current.parentElement;
  }

  if (current !== sourceElement) {
    return null;
  }
  return normalizeGpuFlowPortLocalRect({
    height: element.offsetHeight,
    width: element.offsetWidth,
    x,
    y,
  });
}

function getGpuFlowPortSideNormal(side: HandlePosition): GpuPoint {
  switch (side) {
    case HandlePosition.Left:
      return { x: -1, y: 0 };
    case HandlePosition.Right:
      return { x: 1, y: 0 };
  }
}

function getGpuFlowScenePortHandleType(
  kind: GpuFlowScene["sections"][number]["portAnchors"][number]["kind"],
): HandleType | null {
  if (kind === "input") {
    return "target";
  }
  if (kind === "output") {
    return "source";
  }
  return null;
}

function normalizeGpuFlowPortDescriptor(
  descriptor: GpuFlowPortDescriptor,
): GpuFlowPortDescriptor {
  if (descriptor.nodeId.length === 0) {
    throw new Error("GPU flow port node id is required.");
  }
  if (descriptor.portId.length === 0) {
    throw new Error("GPU flow port id is required.");
  }
  return {
    ...descriptor,
    localRect: normalizeGpuFlowPortLocalRect(descriptor.localRect),
  };
}

function normalizeGpuFlowPortLocalRect(rect: GpuRect): GpuRect {
  assertFiniteNumber("GPU flow port local x", rect.x);
  assertFiniteNumber("GPU flow port local y", rect.y);
  assertFiniteNonNegativeNumber("GPU flow port local width", rect.width);
  assertFiniteNonNegativeNumber("GPU flow port local height", rect.height);
  return {
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite.`);
  }
}

function assertFiniteNonNegativeNumber(name: string, value: number): void {
  assertFiniteNumber(name, value);
  if (value < 0) {
    throw new Error(`${name} must be non-negative.`);
  }
}

function areGpuFlowPortDescriptorsEqual(
  left: GpuFlowPortDescriptor,
  right: GpuFlowPortDescriptor,
): boolean {
  return (
    left.element === right.element &&
    left.isConnectableEnd === right.isConnectableEnd &&
    left.isConnectableStart === right.isConnectableStart &&
    left.nodeId === right.nodeId &&
    left.portId === right.portId &&
    left.side === right.side &&
    left.type === right.type &&
    areGpuRectsEqual(left.localRect, right.localRect)
  );
}

function areGpuRectsEqual(left: GpuRect, right: GpuRect): boolean {
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}
