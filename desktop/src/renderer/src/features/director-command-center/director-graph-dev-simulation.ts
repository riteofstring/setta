import type {
  SemanticActor,
  SemanticEdge,
  SemanticEdgeKind,
  SemanticNode,
  SemanticNodeKind,
  SemanticNodeStatus,
  WorkstreamDetailLevel,
  WorkstreamGraph,
} from "@generated/backend";

import {
  directorGridTrailNodeCount,
  directorGridUsesActivityNodes,
  directorPresentationFor,
  packSemanticGraphComposition,
  type SemanticGraphPresentation,
  type SemanticGraphViewport,
} from "../director-graph/semantic-graph-packer";
import type { PackedGraphSnapshot } from "../director-graph/packed-graph-snapshot";
import { directorGraphLaneId } from "./director-graph-presentation";

export const directorGraphDevThreadCounts = [3, 4, 6, 9, 16, 64, 100] as const;
export type DirectorGraphDevThreadCount = (typeof directorGraphDevThreadCounts)[number];
export const directorGraphDevNodeCounts = [3, 4, 6, 9, 16, 64, 100] as const;
export type DirectorGraphDevNodeCount = (typeof directorGraphDevNodeCounts)[number];
export const directorGraphDevDefaultNodeCount = 4 satisfies DirectorGraphDevNodeCount;
export const directorGraphDevSpeeds = [0, 0.1, 0.25, 0.5, 1, 2] as const;
export type DirectorGraphDevSpeed = (typeof directorGraphDevSpeeds)[number];
export const directorGraphDevDefaultSpeed = 0.25 satisfies DirectorGraphDevSpeed;
export type DirectorGraphDevRunningSpeed = Exclude<DirectorGraphDevSpeed, 0>;

/**
 * One piece of the demo's event-time to animation-time schedule.
 *
 * Event time advances at the selected playback rate. Animation time always
 * advances at one real second per second, so changing or pausing playback only
 * reschedules future facts; an animation already on screen keeps its age and
 * duration. This is the same separation as the HTML concept's fixed `growT`
 * animation clock and speed-dependent event intervals.
 */
interface DirectorGraphDevTimelineSegment {
  readonly animationStartSeconds: number;
  readonly speed: DirectorGraphDevRunningSpeed;
  readonly virtualStartSeconds: number;
}

export type DirectorGraphDevTimeline = readonly DirectorGraphDevTimelineSegment[];

export function createDirectorGraphDevTimeline(
  speed: DirectorGraphDevRunningSpeed,
): DirectorGraphDevTimeline {
  return [{ animationStartSeconds: 0, speed, virtualStartSeconds: 0 }];
}

export function rescheduleDirectorGraphDevTimeline(
  timeline: DirectorGraphDevTimeline,
  virtualStartSeconds: number,
  animationStartSeconds: number,
  speed: DirectorGraphDevRunningSpeed,
): DirectorGraphDevTimeline {
  const retained = timeline.filter((segment) => segment.virtualStartSeconds < virtualStartSeconds);
  return [...retained, { animationStartSeconds, speed, virtualStartSeconds }];
}

export function directorGraphDevAnimationTimeAt(
  timeline: DirectorGraphDevTimeline,
  virtualSeconds: number,
): number {
  const first = timeline[0];
  if (first === undefined) {
    throw new Error("graph simulator timeline requires an initial segment");
  }
  let active = first;
  for (let index = 1; index < timeline.length; index += 1) {
    const candidate = timeline[index];
    if (candidate === undefined || virtualSeconds <= candidate.virtualStartSeconds) {
      break;
    }
    active = candidate;
  }
  return (
    active.animationStartSeconds + (virtualSeconds - active.virtualStartSeconds) / active.speed
  );
}

function directorGraphDevTimelineKey(timeline: DirectorGraphDevTimeline): string {
  return timeline
    .map(
      (segment) =>
        `${segment.virtualStartSeconds}:${segment.animationStartSeconds}:${segment.speed}`,
    )
    .join("|");
}

export interface DirectorGraphDevSimulation {
  readonly description: string;
  readonly frameKey: string;
  readonly nodeCount: DirectorGraphDevNodeCount;
  readonly presentation: SemanticGraphPresentation;
  readonly snapshot: PackedGraphSnapshot;
  readonly sourceNodeCount: number;
  readonly threadCount: DirectorGraphDevThreadCount;
  readonly timeSecondsAt: (timestampMs: number) => number;
  readonly titles: ReadonlyMap<string, string>;
}

export interface DirectorGraphDevScenario {
  readonly graphs: readonly WorkstreamGraph[];
  readonly nodeCount: DirectorGraphDevNodeCount;
  readonly sourceNodeCount: number;
  readonly threadCount: DirectorGraphDevThreadCount;
  readonly timelineKey: string;
  readonly titles: ReadonlyMap<string, string>;
}

const simulationEpochMs = Date.UTC(2026, 6, 30, 12, 0, 0);
const simulationNodeStepSeconds = 1.6;
export const directorGraphDevThreadPhaseCount = 4;
const simulationPauseSteps = 3;
export const directorGraphDevFrameStepSeconds =
  simulationNodeStepSeconds / directorGraphDevThreadPhaseCount;
const simulationFrameBoundaryEpsilonSeconds = directorGraphDevFrameStepSeconds * 1e-9;

export function directorGraphDevCycleDurationSeconds(nodeCount: DirectorGraphDevNodeCount): number {
  return (nodeCount - 1 + simulationPauseSteps) * simulationNodeStepSeconds;
}

export function directorGraphDevTimeInCycle(
  timeSeconds: number,
  nodeCount: DirectorGraphDevNodeCount,
): number {
  const duration = directorGraphDevCycleDurationSeconds(nodeCount);
  return ((Math.max(0, timeSeconds) % duration) + duration) % duration;
}

export function directorGraphDevFrameIndexAt(
  timeSeconds: number,
  nodeCount: DirectorGraphDevNodeCount,
): number {
  const maximum = (nodeCount - 1) * directorGraphDevThreadPhaseCount;
  return Math.min(
    maximum,
    Math.floor(
      (directorGraphDevTimeInCycle(timeSeconds, nodeCount) +
        simulationFrameBoundaryEpsilonSeconds) /
        directorGraphDevFrameStepSeconds,
    ),
  );
}

const threadSubjects = [
  "Particle field parity",
  "Workstream navigation",
  "Approval queue",
  "Artifact previews",
  "Voice capture",
  "Graph performance",
  "Queue steering",
  "Restart recovery",
  "Layout polish",
] as const;

const terminalPlans = [
  {
    edgeKind: "followed_by",
    kind: "action",
    status: "active",
    summary: "Applying the change",
  },
  {
    edgeKind: "depends_on",
    kind: "approval_required",
    status: "waiting",
    summary: "Waiting for approval",
  },
  {
    edgeKind: "validated_by",
    kind: "completed",
    status: "succeeded",
    summary: "Finished and verified",
  },
  {
    edgeKind: "followed_by",
    kind: "failed",
    status: "failed",
    summary: "Found a reproducible failure",
  },
  {
    edgeKind: "followed_by",
    kind: "investigation",
    status: "active",
    summary: "Tracing the remaining behavior",
  },
] as const satisfies readonly {
  readonly edgeKind: SemanticEdgeKind;
  readonly kind: SemanticNodeKind;
  readonly status: SemanticNodeStatus;
  readonly summary: string;
}[];

interface DevNodePlan {
  readonly actor: SemanticActor;
  readonly at: number;
  readonly kind: SemanticNodeKind;
  readonly status: SemanticNodeStatus;
  readonly summary: string;
}

function timestampAt(seconds: number): string {
  return new Date(simulationEpochMs + seconds * 1000).toISOString();
}

function terminalStatus(status: SemanticNodeStatus): boolean {
  return status === "cancelled" || status === "failed" || status === "succeeded";
}

function devNode(workstreamId: string, sequence: number, plan: DevNodePlan): SemanticNode {
  const completedAt = terminalStatus(plan.status) ? timestampAt(plan.at + 0.45) : null;
  return {
    id: `${workstreamId}:node-${sequence}`,
    kind: plan.kind,
    workstreamId,
    runId: `${workstreamId}:run`,
    actor: plan.actor,
    status: plan.status,
    publicSummary: plan.summary,
    evidenceClass: plan.kind === "director_decision" ? "structured_declaration" : "runtime_fact",
    sourceEventIds: [`${workstreamId}:event-${sequence}`],
    artifactIds: [],
    createdAt: timestampAt(plan.at),
    updatedAt: completedAt ?? timestampAt(plan.at + 0.2),
    completedAt,
    interpretation: null,
  };
}

interface DevEdgeInput {
  readonly at: number;
  readonly fromNodeId: string;
  readonly kind: SemanticEdgeKind;
  readonly sequence: number;
  readonly toNodeId: string;
  readonly workstreamId: string;
}

function devEdge({
  at,
  fromNodeId,
  kind,
  sequence,
  toNodeId,
  workstreamId,
}: DevEdgeInput): SemanticEdge {
  return {
    id: `${workstreamId}:edge-${sequence}`,
    kind,
    workstreamId,
    fromNodeId,
    toNodeId,
    sourceEventIds: [`${workstreamId}:edge-event-${sequence}`],
    createdAt: timestampAt(at),
  };
}

function graphFromPlans(
  workstreamId: string,
  detailLevel: WorkstreamDetailLevel,
  plans: readonly DevNodePlan[],
  edgeKinds: readonly SemanticEdgeKind[],
  timeline: DirectorGraphDevTimeline,
): WorkstreamGraph {
  const animationPlans = plans.map((plan) => ({
    ...plan,
    at: directorGraphDevAnimationTimeAt(timeline, plan.at),
  }));
  const nodes = animationPlans.map((plan, index) => devNode(workstreamId, index, plan));
  const edges = edgeKinds.map((kind, index) => {
    const from = nodes[index];
    const to = nodes[index + 1];
    if (from === undefined || to === undefined) {
      throw new RangeError(`simulation edge ${index} has no matching nodes`);
    }
    return devEdge({
      at: animationPlans[index + 1]?.at ?? 0,
      fromNodeId: from.id,
      kind,
      sequence: index,
      toNodeId: to.id,
      workstreamId,
    });
  });
  return { workstreamId, detailLevel, nodes, edges, hasEarlier: false };
}

function directorPlan(
  index: number,
  nodeCount: DirectorGraphDevNodeCount,
  threadCount: DirectorGraphDevThreadCount,
): DevNodePlan {
  const at = index * simulationNodeStepSeconds;
  if (index === 0) {
    return {
      actor: "user",
      at,
      kind: "user_goal",
      status: "succeeded",
      summary: `Preview ${threadCount} simultaneous threads`,
    };
  }
  if (index === nodeCount - 1) {
    return {
      actor: "director",
      at,
      kind: "milestone",
      status: "active",
      summary: `Tracking ${threadCount} workstreams after ${nodeCount} events`,
    };
  }
  const phase = (index - 1) % 3;
  if (phase === 0) {
    return {
      actor: "director",
      at,
      kind: "director_decision",
      status: "succeeded",
      summary: `Planned routing checkpoint ${index}`,
    };
  }
  if (phase === 1) {
    return {
      actor: "director",
      at,
      kind: "delegation",
      status: "succeeded",
      summary: `Delegated work batch ${index}`,
    };
  }
  return {
    actor: "director",
    at,
    kind: "milestone",
    status: "succeeded",
    summary: `Reviewed progress checkpoint ${index}`,
  };
}

function directorGraph(
  threadCount: DirectorGraphDevThreadCount,
  nodeCount: DirectorGraphDevNodeCount,
  timeline: DirectorGraphDevTimeline,
): WorkstreamGraph {
  const plans = Array.from({ length: nodeCount }, (_unused, index) =>
    directorPlan(index, nodeCount, threadCount),
  );
  const edgeKinds = plans
    .slice(1)
    .map((plan): SemanticEdgeKind => (plan.kind === "delegation" ? "delegated_to" : "followed_by"));
  return graphFromPlans(directorGraphLaneId, "selected", plans, edgeKinds, timeline);
}

function threadDetailLevel(
  threadIndex: number,
  threadCount: DirectorGraphDevThreadCount,
): WorkstreamDetailLevel {
  if (threadCount <= 4) {
    return "selected";
  }
  return threadIndex < 3 ? "adjacent" : "background";
}

function threadTitle(threadIndex: number): string {
  const subject = threadSubjects[threadIndex % threadSubjects.length] ?? "Simulated work";
  const cycle = Math.floor(threadIndex / threadSubjects.length);
  return cycle === 0 ? subject : `${subject} ${cycle + 1}`;
}

function threadGraph(
  threadIndex: number,
  threadCount: DirectorGraphDevThreadCount,
  nodeCount: DirectorGraphDevNodeCount,
  timeline: DirectorGraphDevTimeline,
): WorkstreamGraph {
  const workstreamId = `dev-workstream-${threadIndex + 1}`;
  const title = threadTitle(threadIndex);
  const terminal = terminalPlans[threadIndex % terminalPlans.length] ?? terminalPlans[0];
  const phaseAt =
    ((threadIndex % directorGraphDevThreadPhaseCount) + 1) * directorGraphDevFrameStepSeconds;
  const intermediateKinds = ["plan", "investigation", "action", "artifact", "validation"] as const;
  const plans = Array.from({ length: nodeCount }, (_unused, index): DevNodePlan => {
    const at = index === 0 ? 0 : (index - 1) * simulationNodeStepSeconds + phaseAt;
    if (index === 0) {
      return { actor: "system", at, kind: "workstream", status: "active", summary: title };
    }
    if (index === 1) {
      return {
        actor: "user",
        at,
        kind: "user_goal",
        status: "succeeded",
        summary: `Improve ${title.toLowerCase()}`,
      };
    }
    if (index === nodeCount - 1) {
      return {
        actor: "worker",
        at,
        kind: terminal.kind,
        status: terminal.status,
        summary: `${terminal.summary} after ${nodeCount} events`,
      };
    }
    const kind =
      intermediateKinds[(index - 2 + threadIndex) % intermediateKinds.length] ?? "action";
    return {
      actor: "worker",
      at,
      kind,
      status: "succeeded",
      summary: `${title} · ${kind.replace("_", " ")} checkpoint ${index}`,
    };
  });
  const edgeKinds = plans.slice(1).map((plan, index): SemanticEdgeKind => {
    if (index === plans.length - 2) {
      return terminal.edgeKind;
    }
    if (plan.kind === "artifact") {
      return "produced";
    }
    if (plan.kind === "validation") {
      return "validated_by";
    }
    return "followed_by";
  });
  return graphFromPlans(
    workstreamId,
    threadDetailLevel(threadIndex, threadCount),
    plans,
    edgeKinds,
    timeline,
  );
}

function threadNodeCountAt(
  threadIndex: number,
  nodeCount: DirectorGraphDevNodeCount,
  frameIndex: number,
): number {
  const completedIntervals = Math.floor(frameIndex / directorGraphDevThreadPhaseCount);
  const completedPhase = frameIndex % directorGraphDevThreadPhaseCount;
  const phase = threadIndex % directorGraphDevThreadPhaseCount;
  return Math.min(nodeCount, 1 + completedIntervals + (phase < completedPhase ? 1 : 0));
}

function visibleGraphPrefix(graph: WorkstreamGraph, visibleNodeCount: number): WorkstreamGraph {
  const nodes = graph.nodes.slice(0, visibleNodeCount);
  const nodeIDs = new Set(nodes.map((node) => node.id));
  return {
    ...graph,
    nodes,
    edges: graph.edges.filter((edge) => nodeIDs.has(edge.fromNodeId) && nodeIDs.has(edge.toNodeId)),
  };
}

function visibleGridThread(
  graph: WorkstreamGraph,
  visibleNodeCount: number,
  activityNodesOnly: boolean,
): WorkstreamGraph {
  const prefix = visibleGraphPrefix(graph, visibleNodeCount);
  const nodes = prefix.nodes.slice(activityNodesOnly ? -1 : -directorGridTrailNodeCount);
  if (activityNodesOnly) {
    return { ...graph, nodes, edges: [] };
  }
  const nodeIDs = new Set(nodes.map((node) => node.id));
  return {
    ...graph,
    nodes,
    edges: graph.edges.filter((edge) => nodeIDs.has(edge.fromNodeId) && nodeIDs.has(edge.toNodeId)),
  };
}

interface SimulationDescriptionInput {
  readonly activityNodesOnly: boolean;
  readonly nodeCount: DirectorGraphDevNodeCount;
  readonly presentation: SemanticGraphPresentation;
  readonly renderedNodeCount: number;
  readonly sourceNodeCount: number;
  readonly threadCount: DirectorGraphDevThreadCount;
}

function simulationDescription({
  activityNodesOnly,
  nodeCount,
  presentation,
  renderedNodeCount,
  sourceNodeCount,
  threadCount,
}: SimulationDescriptionInput): string {
  const scale = `${threadCount} side threads + Director · ${nodeCount} nodes each · ${sourceNodeCount} source / ${renderedNodeCount} rendered`;
  if (presentation === "columns") {
    return `${scale} · columns · complete visible threads`;
  }
  if (activityNodesOnly) {
    return `${scale} · Director spine + activity dots`;
  }
  return `${scale} · Director spine + short trails`;
}

export function createDirectorGraphDevScenario(
  threadCount: DirectorGraphDevThreadCount,
  nodeCount: DirectorGraphDevNodeCount,
  timeline: DirectorGraphDevTimeline,
): DirectorGraphDevScenario {
  const threads = Array.from({ length: threadCount }, (_unused, index) =>
    threadGraph(index, threadCount, nodeCount, timeline),
  );
  const graphs = [directorGraph(threadCount, nodeCount, timeline), ...threads];
  const sourceNodeCount = graphs.reduce((total, graph) => total + graph.nodes.length, 0);
  const titles = new Map<string, string>([[directorGraphLaneId, "Director"]]);
  threads.forEach((graph, index) => {
    titles.set(graph.workstreamId, threadTitle(index));
  });
  return {
    graphs,
    nodeCount,
    sourceNodeCount,
    threadCount,
    timelineKey: directorGraphDevTimelineKey(timeline),
    titles,
  };
}

export function createDirectorGraphDevSimulation(
  scenario: DirectorGraphDevScenario,
  viewport: SemanticGraphViewport,
  timeSeconds: number,
  timeSecondsAt: (timestampMs: number) => number,
): DirectorGraphDevSimulation {
  const { graphs, nodeCount, sourceNodeCount, threadCount, timelineKey, titles } = scenario;
  const presentation = directorPresentationFor(graphs, null, viewport);
  const frameIndex = directorGraphDevFrameIndexAt(timeSeconds, nodeCount);
  const overview = presentation !== "conversation";
  const grid = presentation === "grid";
  const activityNodesOnly = grid && directorGridUsesActivityNodes(graphs.length, viewport);
  const director = graphs[0];
  if (director === undefined) {
    throw new Error("graph simulator scenario requires the Director graph");
  }
  const presentedGraphs = overview
    ? [
        visibleGraphPrefix(
          director,
          Math.min(nodeCount, 1 + Math.floor(frameIndex / directorGraphDevThreadPhaseCount)),
        ),
        ...graphs.slice(1).map((graph, index) => {
          const visibleNodeCount = threadNodeCountAt(index, nodeCount, frameIndex);
          return grid
            ? visibleGridThread(graph, visibleNodeCount, activityNodesOnly)
            : visibleGraphPrefix(graph, visibleNodeCount);
        }),
      ]
    : graphs;
  const snapshot = packSemanticGraphComposition({
    graphs: presentedGraphs,
    presentation,
    viewport,
    workstreamId: `director-graph-dev:${threadCount}:${nodeCount}`,
  });
  return {
    description: simulationDescription({
      activityNodesOnly,
      nodeCount,
      presentation,
      renderedNodeCount: snapshot.nodeCount,
      sourceNodeCount,
      threadCount,
    }),
    frameKey: overview ? `${timelineKey}:overview:${frameIndex}` : `${timelineKey}:conversation`,
    nodeCount,
    presentation,
    snapshot,
    sourceNodeCount,
    threadCount,
    timeSecondsAt,
    titles,
  };
}
