/**
 * Packs the immutable snapshot into the buffers the GPU actually reads.
 *
 * The split is deliberate:
 *
 * - **Static instance columns** — lane, birth, settle, terminal, and the visual
 *   codes — are written once when a fact is appended and re-uploaded only over
 *   the range the snapshot says changed. Appending a fact therefore uploads a
 *   few dozen bytes, not the buffer.
 * - **Node state** — world position and fold openness — is the only thing that
 *   changes per frame. It lives in one RG32F texture that the node, glyph, and
 *   edge shaders all sample, so a fold uploads one range once instead of
 *   rewriting the edge geometry that references those nodes.
 *
 * Nothing here reads a clock, touches GL, or makes a product decision.
 */

import { packedValueAt } from "../packed-graph-vocabulary";
import type { PackedGraphSnapshot } from "../packed-graph-snapshot";

/** Floats per node in the static instance buffer. */
export const graphNodeStaticStride = 9;
/** Floats per edge in the static instance buffer. */
export const graphEdgeStaticStride = 10;
/** Floats per node in the RG32F state texture. */
export const graphNodeStateStride = 2;
/** Texels per row of the node state texture. */
export const graphNodeStateTextureWidth = 256;

export interface GraphUploadRange {
  readonly from: number;
  readonly to: number;
}

const emptyRange: GraphUploadRange = { from: 0, to: 0 };

export interface GraphPackedScene {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodeStatic: Float32Array;
  readonly edgeStatic: Float32Array;
  readonly nodeState: Float32Array;
  /** Node instances whose static columns must be re-uploaded. */
  readonly nodeStaticUpload: GraphUploadRange;
  /** Edge instances whose static columns must be re-uploaded. */
  readonly edgeStaticUpload: GraphUploadRange;
  /** Node state texels that changed this frame. */
  readonly nodeStateUpload: GraphUploadRange;
  /** True when the buffers were reallocated and need a full re-bind. */
  readonly reallocated: boolean;
}

function nextCapacity(current: number, required: number): number {
  let capacity = Math.max(64, current);
  while (capacity < required) {
    capacity *= 2;
  }
  return capacity;
}

function grown(
  source: Float32Array<ArrayBuffer>,
  used: number,
  size: number,
): Float32Array<ArrayBuffer> {
  const next = new Float32Array(size);
  next.set(source.subarray(0, used));
  return next;
}

export class GraphScenePacker {
  private workstreamId = "";
  private syncedNodeCount = 0;
  private syncedEdgeCount = 0;
  private pendingNodeStaticFrom = Number.POSITIVE_INFINITY;
  private pendingEdgeStaticFrom = Number.POSITIVE_INFINITY;
  private nodeStatic = new Float32Array(0);
  private edgeStatic = new Float32Array(0);
  private nodeState = new Float32Array(0);

  /**
   * Records what an applied batch touched. The renderer calls this for every
   * `extendPackedGraphSnapshot`, because appending an edge can rewrite an
   * earlier node's settle time and several batches may land between frames.
   */
  noteChanged(nodesFrom: number, edgesFrom: number): void {
    this.pendingNodeStaticFrom = Math.min(this.pendingNodeStaticFrom, nodesFrom);
    this.pendingEdgeStaticFrom = Math.min(this.pendingEdgeStaticFrom, edgesFrom);
  }

  /**
   * Rewrites the static columns the snapshot changed and the node state the
   * layout moved. Returns the exact ranges the GPU needs.
   */
  sync(
    snapshot: PackedGraphSnapshot,
    layout: { readonly worldY: Float32Array; readonly open: Float32Array },
    stateDirty: GraphUploadRange,
  ): GraphPackedScene {
    const reallocated = this.reallocate(snapshot);
    this.checkAppendOrder(snapshot);
    const nodeStaticFrom = Math.min(
      reallocated ? 0 : this.pendingNodeStaticFrom,
      this.syncedNodeCount,
    );
    const edgeStaticFrom = Math.min(
      reallocated ? 0 : this.pendingEdgeStaticFrom,
      this.syncedEdgeCount,
    );
    this.writeNodeStatic(snapshot, nodeStaticFrom);
    this.writeEdgeStatic(snapshot, edgeStaticFrom);
    const stateFrom = reallocated ? 0 : Math.min(stateDirty.from, snapshot.nodeCount);
    const stateTo = reallocated ? snapshot.nodeCount : Math.min(stateDirty.to, snapshot.nodeCount);
    this.writeNodeState(layout, stateFrom, stateTo);
    this.syncedNodeCount = snapshot.nodeCount;
    this.syncedEdgeCount = snapshot.edgeCount;
    this.pendingNodeStaticFrom = Number.POSITIVE_INFINITY;
    this.pendingEdgeStaticFrom = Number.POSITIVE_INFINITY;
    return {
      nodeCount: snapshot.nodeCount,
      edgeCount: snapshot.edgeCount,
      nodeStatic: this.nodeStatic,
      edgeStatic: this.edgeStatic,
      nodeState: this.nodeState,
      nodeStaticUpload: range(nodeStaticFrom, snapshot.nodeCount),
      edgeStaticUpload: range(edgeStaticFrom, snapshot.edgeCount),
      nodeStateUpload: range(stateFrom, stateTo),
      reallocated,
    };
  }

  private reallocate(snapshot: PackedGraphSnapshot): boolean {
    const switched = snapshot.workstreamId !== this.workstreamId;
    if (switched) {
      this.workstreamId = snapshot.workstreamId;
      this.syncedNodeCount = 0;
      this.syncedEdgeCount = 0;
    }
    let reallocated = switched;
    if (this.nodeStatic.length < snapshot.nodeCount * graphNodeStaticStride) {
      const capacity = nextCapacity(
        this.nodeStatic.length / graphNodeStaticStride,
        snapshot.nodeCount,
      );
      this.nodeStatic = grown(
        this.nodeStatic,
        this.syncedNodeCount * graphNodeStaticStride,
        capacity * graphNodeStaticStride,
      );
      this.nodeState = grown(
        this.nodeState,
        this.syncedNodeCount * graphNodeStateStride,
        stateTexelCapacity(capacity) * graphNodeStateStride,
      );
      reallocated = true;
    }
    if (this.edgeStatic.length < snapshot.edgeCount * graphEdgeStaticStride) {
      const capacity = nextCapacity(
        this.edgeStatic.length / graphEdgeStaticStride,
        snapshot.edgeCount,
      );
      this.edgeStatic = grown(
        this.edgeStatic,
        this.syncedEdgeCount * graphEdgeStaticStride,
        capacity * graphEdgeStaticStride,
      );
      reallocated = true;
    }
    return reallocated;
  }

  /**
   * The visible-range slice below binary searches these columns, so a snapshot
   * that appended out of order would silently drop rows off screen. Durable
   * order never does that; a bug that did should say so.
   */
  private checkAppendOrder(snapshot: PackedGraphSnapshot): void {
    for (let index = Math.max(1, this.syncedEdgeCount); index < snapshot.edgeCount; index += 1) {
      const previous = packedValueAt(snapshot.edges.to, index - 1);
      const current = packedValueAt(snapshot.edges.to, index);
      if (current < previous) {
        throw new Error(
          `director graph edge ${index} targets node ${current} after edge ${index - 1} targeted ${previous}`,
        );
      }
    }
  }

  private writeNodeStatic(snapshot: PackedGraphSnapshot, from: number): void {
    const nodes = snapshot.nodes;
    for (let index = from; index < snapshot.nodeCount; index += 1) {
      const offset = index * graphNodeStaticStride;
      this.nodeStatic[offset] = packedValueAt(nodes.lane, index);
      this.nodeStatic[offset + 1] = packedValueAt(nodes.bornAt, index);
      this.nodeStatic[offset + 2] = packedValueAt(nodes.settleAt, index);
      this.nodeStatic[offset + 3] = packedValueAt(nodes.terminalAt, index);
      this.nodeStatic[offset + 4] = packedValueAt(nodes.mode, index);
      this.nodeStatic[offset + 5] = packedValueAt(nodes.glyph, index);
      this.nodeStatic[offset + 6] = packedValueAt(nodes.role, index);
      this.nodeStatic[offset + 7] = packedValueAt(nodes.emphasis, index);
      this.nodeStatic[offset + 8] = packedValueAt(nodes.detail, index);
    }
  }

  /**
   * An edge's failure time is its child's terminal time. The edge column's
   * `terminated` flag says the same thing, and reading the child keeps one
   * source of truth for when the beam degrades.
   */
  private writeEdgeStatic(snapshot: PackedGraphSnapshot, from: number): void {
    const edges = snapshot.edges;
    for (let index = from; index < snapshot.edgeCount; index += 1) {
      const offset = index * graphEdgeStaticStride;
      const fromNode = packedValueAt(edges.from, index);
      const toNode = packedValueAt(edges.to, index);
      this.edgeStatic[offset] = fromNode;
      this.edgeStatic[offset + 1] = toNode;
      this.edgeStatic[offset + 2] = packedValueAt(snapshot.nodes.lane, fromNode);
      this.edgeStatic[offset + 3] = packedValueAt(snapshot.nodes.lane, toNode);
      this.edgeStatic[offset + 4] = packedValueAt(edges.bornAt, index);
      this.edgeStatic[offset + 5] = packedValueAt(snapshot.nodes.terminalAt, toNode);
      this.edgeStatic[offset + 6] = packedValueAt(edges.confidence, index);
      this.edgeStatic[offset + 7] = (index * 0.373) % 1;
      this.edgeStatic[offset + 8] = packedValueAt(edges.mode, index);
      this.edgeStatic[offset + 9] = packedValueAt(edges.channel, index);
    }
  }

  private writeNodeState(
    layout: { readonly worldY: Float32Array; readonly open: Float32Array },
    from: number,
    to: number,
  ): void {
    for (let index = from; index < to; index += 1) {
      const offset = index * graphNodeStateStride;
      this.nodeState[offset] = packedValueAt(layout.worldY, index);
      this.nodeState[offset + 1] = packedValueAt(layout.open, index);
    }
  }
}

function range(from: number, to: number): GraphUploadRange {
  return to > from ? { from, to } : emptyRange;
}

/** Rounds the state texture up to whole rows so `texSubImage2D` stays aligned. */
export function stateTexelCapacity(nodeCapacity: number): number {
  return Math.ceil(nodeCapacity / graphNodeStateTextureWidth) * graphNodeStateTextureWidth;
}

/** The texture rows a node index range spans. */
export function nodeStateTextureRows(upload: GraphUploadRange): {
  readonly firstRow: number;
  readonly rowCount: number;
} {
  if (upload.to <= upload.from) {
    return { firstRow: 0, rowCount: 0 };
  }
  const firstRow = Math.floor(upload.from / graphNodeStateTextureWidth);
  const lastRow = Math.floor((upload.to - 1) / graphNodeStateTextureWidth);
  return { firstRow, rowCount: lastRow - firstRow + 1 };
}

/**
 * The node slice worth drawing. World positions grow monotonically with node
 * order, so the visible window is a contiguous range and the renderer can bind
 * the instance attributes at an offset instead of drawing all of history.
 */
export function graphVisibleNodeRange(
  worldY: Float32Array,
  nodeCount: number,
  cameraWorldY: number,
  halfWindow: number,
): GraphUploadRange {
  const from = lowerBound(worldY, nodeCount, cameraWorldY - halfWindow);
  const to = lowerBound(worldY, nodeCount, cameraWorldY + halfWindow);
  return { from, to: Math.min(nodeCount, to + 1) };
}

/** The edge slice whose child lands inside a visible node range. */
export function graphVisibleEdgeRange(
  edgeTo: Uint32Array,
  edgeCount: number,
  nodes: GraphUploadRange,
): GraphUploadRange {
  const from = lowerBound(edgeTo, edgeCount, nodes.from);
  const to = lowerBound(edgeTo, edgeCount, nodes.to);
  return { from, to: Math.min(edgeCount, to) };
}

function lowerBound(values: ArrayLike<number>, count: number, target: number): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (packedValueAt(values, middle) < target) {
      low = middle + 1;
      continue;
    }
    high = middle;
  }
  return low;
}
