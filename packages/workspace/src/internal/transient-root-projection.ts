import { applyNodeChanges, type Node, type NodeChange } from "@xyflow/react";

import type { WorkspacePoint } from "./geometry-index.js";
import type { ViewportTransform } from "./interaction-geometry.js";

export type RootProjectionInput = {
  sectionId: string;
  position: WorkspacePoint;
  size: { width: number; height: number };
};

export type RootProjectionSnapshot = Required<RootProjectionInput>;

export type RootProjectionChange =
  | {
      type: "position";
      sectionId: string;
      position: WorkspacePoint;
      dragging: boolean;
    }
  | {
      type: "dimensions";
      sectionId: string;
      size: { width: number; height: number };
      resizing: boolean;
    };

export type RootLayoutCommand =
  | {
      type: "move-root-sections";
      positions: Readonly<Record<string, WorkspacePoint>>;
    }
  | {
      type: "resize-root-section";
      position: WorkspacePoint;
      sectionId: string;
      size: { width: number; height: number };
    };

export type ViewportCommand = {
  type: "set-viewport";
  viewport: ViewportTransform;
};

export type AcceptedRootCommandHandler = (command: RootLayoutCommand) => void;

type InternalRootData = { sectionId: string };
type InternalRootNode = Node<InternalRootData, "workspace-root">;
type RootGesture =
  | { kind: "move"; sectionIds: readonly string[]; baseline: readonly InternalRootNode[] }
  | { kind: "resize"; sectionIds: readonly [string]; baseline: readonly InternalRootNode[] };

function assertPosition(position: WorkspacePoint, sectionId: string): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error(`Root section ${sectionId} position must be finite.`);
  }
}

function assertSize(size: { width: number; height: number }, sectionId: string): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width < 0 ||
    size.height < 0
  ) {
    throw new Error(`Root section ${sectionId} size must be finite and non-negative.`);
  }
}

function assertViewport(viewport: ViewportTransform): void {
  if (
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom <= 0
  ) {
    throw new Error("Viewport transform must be finite with a positive zoom.");
  }
}

function createNode(root: RootProjectionInput): InternalRootNode {
  assertPosition(root.position, root.sectionId);
  assertSize(root.size, root.sectionId);
  return {
    id: root.sectionId,
    type: "workspace-root",
    position: { ...root.position },
    width: root.size.width,
    height: root.size.height,
    data: { sectionId: root.sectionId },
  };
}

function createNodes(roots: readonly RootProjectionInput[]): readonly InternalRootNode[] {
  const ids = roots.map((root) => root.sectionId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Root projection section IDs must be unique.");
  }
  return roots.map(createNode);
}

function cloneNodes(nodes: readonly InternalRootNode[]): readonly InternalRootNode[] {
  return nodes.map((node) => {
    const clone: InternalRootNode = {
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    };
    if (node.measured) {
      clone.measured = { ...node.measured };
    }
    return clone;
  });
}

function nodeSize(node: InternalRootNode): { width: number; height: number } {
  const width = node.measured?.width ?? node.width;
  const height = node.measured?.height ?? node.height;
  if (width === undefined || height === undefined) {
    throw new Error(`Root projection ${node.id} is missing dimensions.`);
  }
  return { width, height };
}

function toSnapshot(node: InternalRootNode): RootProjectionSnapshot {
  return {
    sectionId: node.id,
    position: { ...node.position },
    size: nodeSize(node),
  };
}

function toUpstreamChange(change: RootProjectionChange): NodeChange<InternalRootNode> {
  if (change.type === "position") {
    assertPosition(change.position, change.sectionId);
    return {
      id: change.sectionId,
      type: "position",
      position: { ...change.position },
      dragging: change.dragging,
    };
  }
  assertSize(change.size, change.sectionId);
  return {
    id: change.sectionId,
    type: "dimensions",
    dimensions: { ...change.size },
    resizing: change.resizing,
    setAttributes: true,
  };
}

export class TransientRootProjection {
  #acceptedNodes: readonly InternalRootNode[];
  #activeRootGesture: RootGesture | null = null;
  #activeViewportBaseline: ViewportTransform | null = null;
  #nodes: readonly InternalRootNode[];
  readonly #onAcceptedRootCommand: AcceptedRootCommandHandler | undefined;
  #viewport: ViewportTransform;

  constructor(
    roots: readonly RootProjectionInput[],
    viewport: ViewportTransform,
    onAcceptedRootCommand?: AcceptedRootCommandHandler,
  ) {
    assertViewport(viewport);
    this.#nodes = createNodes(roots);
    this.#acceptedNodes = cloneNodes(this.#nodes);
    this.#onAcceptedRootCommand = onAcceptedRootCommand;
    this.#viewport = { ...viewport };
  }

  roots(): readonly RootProjectionSnapshot[] {
    return this.#nodes.map(toSnapshot);
  }

  viewport(): ViewportTransform {
    return { ...this.#viewport };
  }

  synchronizeRoots(roots: readonly RootProjectionInput[]): void {
    this.#nodes = createNodes(roots);
    this.#acceptedNodes = cloneNodes(this.#nodes);
    this.#activeRootGesture = null;
  }

  beginRootMove(sectionIds: readonly string[]): void {
    if (sectionIds.length === 0) {
      throw new Error("A root move needs at least one section.");
    }
    this.#beginRootGesture("move", sectionIds);
  }

  beginRootResize(sectionId: string): void {
    this.#beginRootGesture("resize", [sectionId]);
  }

  applyRootChanges(changes: readonly RootProjectionChange[]): void {
    const knownIds = new Set(this.#nodes.map((node) => node.id));
    const unknown = changes.find((change) => !knownIds.has(change.sectionId));
    if (unknown) {
      throw new Error(`Unknown root projection section ${unknown.sectionId}.`);
    }
    this.#nodes = applyNodeChanges(changes.map(toUpstreamChange), [...this.#nodes]);
  }

  completeRootGesture(): RootLayoutCommand | null {
    const gesture = this.#activeRootGesture;
    if (!gesture) {
      return null;
    }
    this.#activeRootGesture = null;
    const currentById = new Map(this.roots().map((root) => [root.sectionId, root]));
    const baselineById = new Map(
      gesture.baseline.map(toSnapshot).map((root) => [root.sectionId, root]),
    );
    const command =
      gesture.kind === "move"
        ? this.#moveCommand(gesture.sectionIds, currentById, baselineById)
        : this.#resizeCommand(gesture.sectionIds[0], currentById, baselineById);
    this.#acceptedNodes = cloneNodes(this.#nodes);
    if (command) {
      this.#onAcceptedRootCommand?.(command);
    }
    return command;
  }

  cancelRootGesture(): void {
    const gesture = this.#activeRootGesture;
    if (gesture) {
      this.#nodes = cloneNodes(gesture.baseline);
      this.#activeRootGesture = null;
    }
  }

  beginViewportGesture(): void {
    if (this.#activeViewportBaseline) {
      throw new Error("A viewport gesture is already active.");
    }
    this.#activeViewportBaseline = { ...this.#viewport };
  }

  updateViewport(viewport: ViewportTransform): void {
    assertViewport(viewport);
    this.#viewport = { ...viewport };
  }

  completeViewportGesture(): ViewportCommand | null {
    const baseline = this.#activeViewportBaseline;
    if (!baseline) {
      return null;
    }
    this.#activeViewportBaseline = null;
    return baseline.x === this.#viewport.x &&
      baseline.y === this.#viewport.y &&
      baseline.zoom === this.#viewport.zoom
      ? null
      : { type: "set-viewport", viewport: { ...this.#viewport } };
  }

  cancelViewportGesture(): void {
    if (this.#activeViewportBaseline) {
      this.#viewport = this.#activeViewportBaseline;
      this.#activeViewportBaseline = null;
    }
  }

  resetAcceptedProjection(): void {
    if (this.#activeRootGesture || this.#activeViewportBaseline) {
      throw new Error("Cannot reset the accepted projection during an active gesture.");
    }
    this.#nodes = cloneNodes(this.#acceptedNodes);
  }

  #beginRootGesture(kind: RootGesture["kind"], sectionIds: readonly string[]): void {
    if (this.#activeRootGesture) {
      throw new Error("A root gesture is already active.");
    }
    const knownIds = new Set(this.#nodes.map((node) => node.id));
    const unknownId = sectionIds.find((sectionId) => !knownIds.has(sectionId));
    if (unknownId) {
      throw new Error(`Unknown root projection section ${unknownId}.`);
    }
    const baseline = cloneNodes(this.#nodes);
    this.#activeRootGesture =
      kind === "move"
        ? { kind, sectionIds: [...sectionIds], baseline }
        : { kind, sectionIds: [sectionIds[0] ?? ""], baseline };
  }

  #moveCommand(
    sectionIds: readonly string[],
    currentById: ReadonlyMap<string, RootProjectionSnapshot>,
    baselineById: ReadonlyMap<string, RootProjectionSnapshot>,
  ): RootLayoutCommand | null {
    const positions = Object.fromEntries(
      sectionIds.flatMap((sectionId) => {
        const current = currentById.get(sectionId);
        const baseline = baselineById.get(sectionId);
        if (!current || !baseline) {
          throw new Error(`Missing root projection section ${sectionId} at gesture completion.`);
        }
        const changed =
          current.position.x !== baseline.position.x || current.position.y !== baseline.position.y;
        return changed ? [[sectionId, { ...current.position }]] : [];
      }),
    );
    return Object.keys(positions).length === 0 ? null : { type: "move-root-sections", positions };
  }

  #resizeCommand(
    sectionId: string,
    currentById: ReadonlyMap<string, RootProjectionSnapshot>,
    baselineById: ReadonlyMap<string, RootProjectionSnapshot>,
  ): RootLayoutCommand | null {
    const current = currentById.get(sectionId);
    const baseline = baselineById.get(sectionId);
    if (!current || !baseline) {
      throw new Error(`Missing root projection section ${sectionId} at gesture completion.`);
    }
    return current.position.x === baseline.position.x &&
      current.position.y === baseline.position.y &&
      current.size.width === baseline.size.width &&
      current.size.height === baseline.size.height
      ? null
      : {
          position: { ...current.position },
          sectionId,
          size: { ...current.size },
          type: "resize-root-section",
        };
  }
}
