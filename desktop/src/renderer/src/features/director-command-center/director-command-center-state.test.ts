import type {
  DirectorEvent,
  DirectorSnapshot,
  DirectorWorkstreamEntry,
  SemanticNode,
  WorkstreamGraph,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import { applyDirectorEvent, selectedWorkstreamEntry } from "./director-command-center-state";

describe("Director command-center state", () => {
  test("applies adjacent Director events without replacing the whole snapshot", () => {
    const initial = snapshot();
    const updated = applyDirectorEvent(initial, workstreamEvent(1, "running"));
    const selected = selectedWorkstreamEntry(updated);

    expect(updated.eventCursor).toEqual({ sequence: 1, streamId: "director:test" });
    expect(selected?.workstream.status).toBe("running");
    expect(updated.graphs).toBe(initial.graphs);
    expect(updated.unresolvedApprovals).toBe(initial.unresolvedApprovals);
  });

  test("updates graph deltas and removes records that leave unresolved rails", () => {
    const withNode = applyDirectorEvent(snapshot(), graphEvent(1, [node("goal")], []));
    const withApproval = applyDirectorEvent(withNode, approvalEvent(2, "pending"));
    const resolved = applyDirectorEvent(withApproval, approvalEvent(3, "approved"));
    const graph = resolved.graphs[0];

    expect(graph?.nodes.map((record) => record.id)).toEqual(["goal"]);
    expect(resolved.unresolvedApprovals).toEqual([]);
    expect(resolved.eventCursor.sequence).toBe(3);
  });

  test("removes a deleted graph node and connected edges", () => {
    const first = node("goal");
    const second = node("done", "completed");
    const initial = applyDirectorEvent(
      snapshot(),
      graphEvent(
        1,
        [first, second],
        [
          {
            createdAt: "2026-07-25T17:01:00Z",
            fromNodeId: "goal",
            fromWorkstreamId: "workstream:alpha",
            id: "edge:goal-done",
            kind: "followed_by",
            sourceEventIds: ["event:edge"],
            toNodeId: "done",
            toWorkstreamId: "workstream:alpha",
          },
        ],
      ),
    );
    const removed = applyDirectorEvent(initial, {
      ...baseEvent(2, "director.graph.updated"),
      graphUpdated: {
        detailLevel: "selected",
        edges: [],
        nodes: [],
        removedNodeIds: ["goal"],
        workstreamId: "workstream:alpha",
      },
    });

    expect(removed.graphs[0]?.nodes.map((record) => record.id)).toEqual(["done"]);
    expect(removed.graphs[0]?.edges).toEqual([]);
  });
});

function snapshot(): DirectorSnapshot {
  const entry = workstreamEntry("idle");
  const graph: WorkstreamGraph = {
    detailLevel: "selected",
    edges: [],
    hasEarlier: false,
    nodes: [],
    workstreamId: entry.workstream.id,
  };
  return {
    aggregates: {
      artifactCount: 0,
      awaitingApprovalCount: 0,
      awaitingResourceCount: 0,
      blockedCount: 0,
      failedCount: 0,
      queuedCount: 0,
      runningCount: 0,
      unresolvedApprovalCount: 0,
      unresolvedResourceRequestCount: 0,
      workstreamCount: 1,
    },
    artifacts: [],
    connection: { lastEventAt: null, status: "connected" },
    eventCursor: { sequence: 0, streamId: "director:test" },
    graphs: [graph],
    hasMoreWorkstreams: false,
    schemaVersion: 1,
    selectedWorkstreamId: entry.workstream.id,
    unresolvedApprovals: [],
    unresolvedResourceRequests: [],
    workstreams: [entry],
  };
}

function workstreamEntry(status: DirectorWorkstreamEntry["workstream"]["status"]) {
  return {
    detailLevel: "selected",
    workstream: {
      activeRunId: status === "running" ? "run:alpha" : null,
      artifactCount: 0,
      createdAt: "2026-07-25T17:00:00Z",
      id: "workstream:alpha",
      lastMilestone: null,
      parentId: null,
      queuedRunCount: 0,
      resourceBindings: [],
      resourceScope: { folder: null, kind: "folderless" },
      status,
      title: "Alpha",
      unresolvedApprovalCount: 0,
      unresolvedResourceRequestCount: 0,
      updatedAt: status === "running" ? "2026-07-25T17:02:00Z" : "2026-07-25T17:00:00Z",
    },
  } satisfies DirectorWorkstreamEntry;
}

function node(id: string, kind: SemanticNode["kind"] = "user_goal"): SemanticNode {
  return {
    actor: kind === "user_goal" ? "user" : "director",
    artifactIds: [],
    completedAt: kind === "completed" ? "2026-07-25T17:02:00Z" : null,
    createdAt: id === "goal" ? "2026-07-25T17:00:00Z" : "2026-07-25T17:01:00Z",
    evidenceClass: "runtime_fact",
    id,
    interpretation: null,
    kind,
    publicSummary: id,
    runId: "run:alpha",
    sourceEventIds: [`event:${id}`],
    status: kind === "completed" ? "succeeded" : "active",
    updatedAt: id === "goal" ? "2026-07-25T17:00:00Z" : "2026-07-25T17:01:00Z",
    workstreamId: "workstream:alpha",
  };
}

function workstreamEvent(
  sequence: number,
  status: DirectorWorkstreamEntry["workstream"]["status"],
): DirectorEvent {
  return {
    ...baseEvent(sequence, "director.workstream.updated"),
    workstreamUpdated: { entry: workstreamEntry(status) },
  };
}

function graphEvent(
  sequence: number,
  nodes: WorkstreamGraph["nodes"],
  edges: WorkstreamGraph["edges"],
): DirectorEvent {
  return {
    ...baseEvent(sequence, "director.graph.updated"),
    graphUpdated: {
      detailLevel: "selected",
      edges,
      nodes,
      removedNodeIds: [],
      workstreamId: "workstream:alpha",
    },
  };
}

function approvalEvent(sequence: number, status: "approved" | "pending"): DirectorEvent {
  return {
    ...baseEvent(sequence, "director.approval.updated"),
    approvalUpdated: {
      approval: {
        id: "approval:alpha",
        kind: "command",
        publicSummary: "Run command",
        questions: [],
        requestedAt: "2026-07-25T17:00:00Z",
        resolvedAt: status === "pending" ? null : "2026-07-25T17:03:00Z",
        runId: "run:alpha",
        secret: false,
        sourceEventIds: ["event:approval"],
        status,
        workstreamId: "workstream:alpha",
      },
    },
  };
}

function baseEvent(sequence: number, kind: DirectorEvent["kind"]): DirectorEvent {
  return {
    aggregatesUpdated: null,
    approvalUpdated: null,
    artifactUpdated: null,
    emittedAt: `2026-07-25T17:00:0${sequence}Z`,
    eventId: `director:test:${sequence}`,
    graphUpdated: null,
    kind,
    resourceRequestUpdated: null,
    resyncRequired: null,
    schemaVersion: 1,
    selectionChanged: null,
    sequence,
    streamId: "director:test",
    textDelta: null,
    workstreamRemoved: null,
    workstreamUpdated: null,
  };
}
