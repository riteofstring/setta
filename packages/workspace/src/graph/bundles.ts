import {
  getWorkspaceGraphBezier,
  type WorkspaceGraphPoint,
} from "./geometry.js";
import type { WorkspaceGraphEdge, WorkspaceGraphPortSide } from "./types.js";

type WorkspaceGraphEndpoint = Readonly<{
  point: WorkspaceGraphPoint;
  side: WorkspaceGraphPortSide;
}>;

type WorkspaceGraphBundleLane = Readonly<{
  offset: number;
  run: number;
}>;

export type WorkspaceGraphBundledEdge = Readonly<{
  source?: WorkspaceGraphBundleLane;
  target?: WorkspaceGraphBundleLane;
}>;

export type WorkspaceGraphTie = Readonly<{
  bottom: number;
  direction: number;
  top: number;
  x: number;
}>;

type WorkspaceGraphBundles = Readonly<{
  edges: ReadonlyMap<string, WorkspaceGraphBundledEdge>;
  ties: readonly WorkspaceGraphTie[];
}>;

const LANE_SPACING = 4;
const FAN_LENGTH = 10;
const MIN_RUN = 28;
const MAX_RUN = 72;
const TIE_PADDING = 3;
const MIN_TIED_LENGTH = 90;

function getDirection(side: WorkspaceGraphPortSide): number {
  return side === "right" ? 1 : -1;
}

function getBundleTies(
  port: WorkspaceGraphEndpoint,
  run: number,
  lanes: number,
): WorkspaceGraphTie[] {
  const direction = getDirection(port.side);
  const half = ((lanes - 1) / 2) * LANE_SPACING + TIE_PADDING;
  const fractions = run >= 48 ? [0.35, 0.85] : [0.7];
  return fractions.map((fraction) => ({
    bottom: port.point.y + half,
    direction,
    top: port.point.y - half,
    x: port.point.x + direction * (FAN_LENGTH + (run - FAN_LENGTH) * fraction),
  }));
}

type WorkspaceGraphBundleGroup = {
  end: "source" | "target";
  members: [string, number, number][];
  portId: string;
};

function getEdgeLength(
  edge: WorkspaceGraphEdge,
  ports: ReadonlyMap<string, WorkspaceGraphEndpoint>,
): number {
  const source = ports.get(edge.source.portId);
  const target = ports.get(edge.target.portId);
  if (edge.hidden || !source || !target) {
    return 0;
  }
  return Math.hypot(
    target.point.x - source.point.x,
    target.point.y - source.point.y,
  );
}

function groupTiedEdges(
  edges: readonly WorkspaceGraphEdge[],
  ports: ReadonlyMap<string, WorkspaceGraphEndpoint>,
): Iterable<WorkspaceGraphBundleGroup> {
  const groups = new Map<string, WorkspaceGraphBundleGroup>();
  for (const edge of edges) {
    const length = getEdgeLength(edge, ports);
    if (length < MIN_TIED_LENGTH) {
      continue;
    }
    for (const [end, portId, farId] of [
      ["source", edge.source.portId, edge.target.portId],
      ["target", edge.target.portId, edge.source.portId],
    ] as const) {
      const key = `${end}:${portId}`;
      const group = groups.get(key) ?? { end, members: [], portId };
      group.members.push([edge.id, ports.get(farId)!.point.y, length]);
      groups.set(key, group);
    }
  }
  return groups.values();
}

export function getWorkspaceGraphBundles(
  edges: readonly WorkspaceGraphEdge[],
  ports: ReadonlyMap<string, WorkspaceGraphEndpoint>,
): WorkspaceGraphBundles {
  const bundled = new Map<string, WorkspaceGraphBundledEdge>();
  const ties: WorkspaceGraphTie[] = [];
  for (const { end, members, portId } of groupTiedEdges(edges, ports)) {
    if (members.length < 2) {
      continue;
    }
    members.sort(([leftId, left], [rightId, right]) =>
      left === right ? leftId.localeCompare(rightId) : left - right,
    );
    const nearest = Math.min(...members.map(([, , length]) => length));
    const run = Math.min(MAX_RUN, Math.max(MIN_RUN, nearest * 0.3));
    members.forEach(([edgeId], index) => {
      const lane = {
        offset: (index - (members.length - 1) / 2) * LANE_SPACING,
        run,
      };
      bundled.set(edgeId, { ...bundled.get(edgeId), [end]: lane });
    });
    ties.push(...getBundleTies(ports.get(portId)!, run, members.length));
  }
  return { edges: bundled, ties };
}

function getLane(
  port: WorkspaceGraphEndpoint,
  lane: WorkspaceGraphBundleLane | undefined,
): { end: WorkspaceGraphPoint; lead: WorkspaceGraphPoint[] } {
  if (!lane) {
    return { end: port.point, lead: [] };
  }
  const direction = getDirection(port.side);
  const y = port.point.y + lane.offset;
  return {
    end: { x: port.point.x + direction * lane.run, y },
    lead: [port.point, { x: port.point.x + direction * FAN_LENGTH, y }],
  };
}

function formatPoint({ x, y }: WorkspaceGraphPoint): string {
  return `${x},${y}`;
}

export function getWorkspaceGraphBundledPath(
  source: WorkspaceGraphEndpoint,
  target: WorkspaceGraphEndpoint,
  bundle: WorkspaceGraphBundledEdge | undefined,
): ReturnType<typeof getWorkspaceGraphBezier> {
  const sourceLane = getLane(source, bundle?.source);
  const targetLane = getLane(target, bundle?.target);
  const bezier = getWorkspaceGraphBezier(
    sourceLane.end,
    source.side,
    targetLane.end,
    target.side,
  );
  const head = sourceLane.lead.map((point) => `${formatPoint(point)} L`);
  const tail = [...targetLane.lead]
    .reverse()
    .map((point) => ` L${formatPoint(point)}`);
  return Object.freeze({
    ...bezier,
    path: `M${head.join("")}${bezier.path.slice(1)}${tail.join("")}`,
  });
}
