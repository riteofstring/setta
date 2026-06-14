import { describe, expect, test } from "vitest";

import type {
  SemanticActivityInterval,
  SemanticActivitySummary,
  SemanticGraphChangeEvent,
} from "@generated/backend";
import {
  semanticGraphActivitySummaryMap,
  semanticGraphChangeAffectsWorkspaceGraphState,
  semanticGraphRefreshRequestForChange,
} from "./semantic-graph-state";

describe("semanticGraphActivitySummaryMap", () => {
  test("projects current and recent activity by semantic target without duplicates", () => {
    const active = activity({ endedAt: "", id: "activity_active", summary: "Active work" });
    const recent = activity({
      endedAt: "2026-06-10T12:05:00Z",
      id: "activity_recent",
      summary: "Recent work",
    });
    const duplicateRecent = { ...active };
    const other = activity({
      endedAt: "",
      id: "activity_other",
      summary: "Other",
      targetEntityId: "node_finding",
    });
    const summary: SemanticActivitySummary = {
      targets: [
        {
          currentActivity: [active],
          recentActivity: [duplicateRecent, recent],
          targetEntityId: "node_constraint",
        },
        {
          currentActivity: [],
          recentActivity: [other],
          targetEntityId: "node_finding",
        },
      ],
      workspaceId: "workspace_test",
    };

    expect([...semanticGraphActivitySummaryMap(summary)]).toEqual([
      ["node_constraint", [active, recent]],
      ["node_finding", [other]],
    ]);
  });
});

describe("semanticGraphChangeAffectsWorkspaceGraphState", () => {
  test("matches selected-workspace graph, activity, and working-set changes", () => {
    const event = semanticGraphChangeEvent({ workspaceId: "workspace_graph" });

    expect(semanticGraphChangeAffectsWorkspaceGraphState(event, "workspace_graph")).toBe(true);
    expect(semanticGraphChangeAffectsWorkspaceGraphState(event, "workspace_other")).toBe(false);
    expect(
      semanticGraphChangeAffectsWorkspaceGraphState(
        semanticGraphChangeEvent({ changedAreas: [] }),
        "workspace_graph",
      ),
    ).toBe(false);
    expect(
      semanticGraphChangeAffectsWorkspaceGraphState(
        semanticGraphChangeEvent({ changedAreas: ["cartographer_audit"] }),
        "workspace_graph",
      ),
    ).toBe(true);
  });
});

describe("semanticGraphRefreshRequestForChange", () => {
  test("requests full graph refreshes for graph and layout changes", () => {
    expect(
      semanticGraphRefreshRequestForChange(
        semanticGraphChangeEvent({ changedAreas: ["graph"] }),
        "workspace_graph",
      ),
    ).toEqual({ activity: true, graph: true, workingSet: false });
    expect(
      semanticGraphRefreshRequestForChange(
        semanticGraphChangeEvent({ changedAreas: ["layout"] }),
        "workspace_graph",
      ),
    ).toEqual({ activity: true, graph: true, workingSet: false });
  });

  test("requests activity refreshes without reloading runtime working-set data", () => {
    expect(
      semanticGraphRefreshRequestForChange(
        semanticGraphChangeEvent({ changedAreas: ["activity"] }),
        "workspace_graph",
      ),
    ).toEqual({ activity: true, graph: false, workingSet: false });
  });

  test("keeps cartographer runtime changes out of durable graph refreshes", () => {
    expect(
      semanticGraphRefreshRequestForChange(
        semanticGraphChangeEvent({ changedAreas: ["cartographer_audit"] }),
        "workspace_graph",
      ),
    ).toBeNull();
    expect(
      semanticGraphRefreshRequestForChange(
        semanticGraphChangeEvent({ changedAreas: ["working_set"] }),
        "workspace_graph",
      ),
    ).toBeNull();
  });

  test("ignores non-graph surface areas and other workspaces", () => {
    expect(
      semanticGraphRefreshRequestForChange(
        semanticGraphChangeEvent({ changedAreas: ["steering"] }),
        "workspace_graph",
      ),
    ).toBeNull();
    expect(
      semanticGraphRefreshRequestForChange(
        semanticGraphChangeEvent({
          changedAreas: ["graph"],
          workspaceId: "workspace_other",
        }),
        "workspace_graph",
      ),
    ).toBeNull();
  });
});

function activity({
  endedAt,
  id,
  summary,
  targetEntityId = "node_constraint",
}: {
  endedAt: string;
  id: string;
  summary: string;
  targetEntityId?: string;
}): SemanticActivityInterval {
  return {
    actorId: "user_state",
    actorKind: "user",
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: "",
    endedAt,
    endedByEventId: endedAt === "" ? "" : "event_activity_end",
    evidenceAnchorId: "evidence_state",
    id,
    kind: "exploring",
    sourceId: "chat_run_state",
    sourceKind: "chat_run",
    startedAt: "2026-06-10T12:00:00Z",
    startedByEventId: "event_activity_start",
    summary,
    targetEntityId,
    updatedAt: endedAt === "" ? "2026-06-10T12:00:00Z" : endedAt,
    workflowDefinitionId: "",
    workflowExecutionId: "",
    workflowNodeId: "",
    workflowNodeExecutionId: "",
    runItemId: "",
    reassignedFromIntervalId: "",
    workspaceId: "workspace_test",
  };
}

function semanticGraphChangeEvent(
  patch: Partial<SemanticGraphChangeEvent> = {},
): SemanticGraphChangeEvent {
  return {
    cartographerPatchIds: [],
    cartographerRunIds: [],
    cartographerWindowIds: [],
    changedAreas: ["graph"],
    createdSemanticEventIds: [],
    eventId: "semantic_graph_changes:1",
    occurredAt: "2026-06-11T12:00:00Z",
    schemaVersion: 1,
    semanticEdgeIds: [],
    semanticNodeIds: ["node_graph"],
    semanticRuntimeDelta: null,
    semanticRuntimeRevision: 1,
    semanticRuntimeSnapshotRequired: false,
    sequence: 1,
    streamId: "semantic_graph_changes",
    targetEntityIds: ["node_graph"],
    type: "semantic_graph.changed",
    workspaceId: "workspace_graph",
    ...patch,
  };
}
