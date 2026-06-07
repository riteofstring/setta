import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { SemanticEventHistory, SemanticNodeDetail } from "@generated/backend";
import { SemanticLoadedNodeDetails } from "./semantic-node-details-surface";

describe("SemanticLoadedNodeDetails", () => {
  test("renders node identity, confidence, evidence, lineage, edges, activity, steering, and history", () => {
    const html = renderToString(
      <SemanticLoadedNodeDetails detail={detail()} history={history()} />,
    );

    expect(html).toContain("Semantic API contract");
    expect(html).toContain("constraint");
    expect(html).toContain("87");
    expect(html).toContain("split_source");
    expect(html).toContain("supports");
    expect(html).toContain("docs/plan.md:4-8");
    expect(html).toContain("sha256:plan");
    expect(html).toContain("chat_run");
    expect(html).toContain("run_detail");
    expect(html).toContain("validating");
    expect(html).toContain("Keep endpoint surface read-only");
    expect(html).toContain("Context pack summary");
    expect(html).toContain("node.created");
  });
});

function detail(): SemanticNodeDetail {
  return {
    activity: [
      {
        endedAt: "",
        endedByEventId: "",
        actorId: "user_detail",
        actorKind: "user",
        chatConversationId: "conversation_detail",
        chatMessageId: "",
        chatRunId: "run_detail",
        evidenceAnchorId: "evidence_node",
        id: "activity_node",
        kind: "validating",
        sourceId: "run_detail",
        sourceKind: "chat_run",
        startedAt: "2026-06-10T12:00:05Z",
        startedByEventId: "event_activity_started",
        summary: "Checking semantic graph UI",
        targetEntityId: "node_contract",
        updatedAt: "2026-06-10T12:00:05Z",
        workflowExecutionId: "",
        workflowNodeId: "",
        workspaceId: "workspace_test",
      },
    ],
    contextPackHistory: [
      {
        createdAt: "2026-06-10T12:00:07Z",
        createdByEventId: "event_pack",
        id: "pack_node",
        itemCount: 2,
        prompt: "Prompt text",
        summary: "Context pack summary",
        targetEntityId: "node_contract",
        workspaceId: "workspace_test",
      },
    ],
    evidence: [
      {
        createdAt: "2026-06-10T12:00:04Z",
        createdByEventId: "event_evidence",
        id: "evidence_node",
        path: "docs/plan.md",
        rangeEnd: 8,
        rangeStart: 4,
        sourceId: "",
        sourceKind: "document",
        summary: "Plan evidence",
        targetEntityId: "node_contract",
        text: "Evidence text",
        contentHash: "sha256:plan",
        uri: "",
        workspaceId: "workspace_test",
      },
    ],
    incomingEdges: [
      {
        createdAt: "2026-06-10T12:00:03Z",
        createdByEventId: "event_edge",
        fromNodeId: "node_finding",
        id: "edge_supports",
        kind: "supports",
        label: "supports",
        summary: "Supporting edge",
        toNodeId: "node_contract",
        updatedAt: "2026-06-10T12:00:03Z",
        updatedByEventId: "event_edge",
        workspaceId: "workspace_test",
      },
    ],
    node: {
      createdAt: "2026-06-10T12:00:01Z",
      createdByEventId: "event_created",
      dismissed: false,
      id: "node_contract",
      kind: "constraint",
      label: "Semantic API contract",
      mergedIntoNodeId: "",
      promoted: true,
      splitFromNodeId: "split_source",
      splitIntoNodeIds: ["split_child"],
      summary: "Renderer reads backend-owned contracts.",
      updatedAt: "2026-06-10T12:00:02Z",
      updatedByEventId: "event_updated",
      workspaceId: "workspace_test",
    },
    outgoingEdges: [],
    steeringDirectives: [
      {
        active: true,
        createdAt: "2026-06-10T12:00:06Z",
        createdByEventId: "event_steering",
        id: "steering_node",
        instruction: "Keep endpoint surface read-only",
        targetEntityId: "node_contract",
        updatedAt: "2026-06-10T12:00:06Z",
        updatedByEventId: "event_steering",
        workspaceId: "workspace_test",
      },
    ],
    workspaceId: "workspace_test",
  };
}

function history(): SemanticEventHistory {
  return {
    events: [
      {
        actorId: "cartographer",
        actorKind: "cartographer",
        causationId: "",
        confidence: 87,
        correlationId: "",
        eventId: "event_created",
        eventType: "node.created",
        logicalClock: 1,
        modelInfo: {},
        observedAt: "2026-06-10T12:00:01Z",
        payload: {},
        retractedByEventId: "",
        runId: "",
        sessionId: "",
        spanId: "",
        supersedesEventId: "",
        targetEntityId: "node_contract",
        traceId: "",
        workflowExecutionId: "",
        workspaceId: "workspace_test",
      },
    ],
    hasMoreOlder: false,
    olderBeforeLogicalClock: 1,
    targetEntityId: "node_contract",
    workspaceId: "workspace_test",
  };
}
