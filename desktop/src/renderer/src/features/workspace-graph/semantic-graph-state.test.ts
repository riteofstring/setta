import { describe, expect, test } from "vitest";

import type { SemanticActivityInterval, SemanticActivitySummary } from "@generated/backend";
import { semanticGraphActivitySummaryMap } from "./semantic-graph-state";

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
