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
    expect(html).toContain("Source Links");
    expect(html).toContain("Why this exists");
    expect(html).toContain("docs/plan.md:4-8");
    expect(html).toContain("sha256:plan");
    expect(html).toContain("chat_run");
    expect(html).toContain("run_detail");
    expect(html).toContain("validating");
    expect(html).toContain("Keep endpoint surface read-only");
    expect(html).toContain("Edit And Steering");
    expect(html).toContain("Rename");
    expect(html).toContain("Add Constraint");
    expect(html).toContain("Add Steering");
    expect(html).toContain("Session Pin");
    expect(html).toContain("workflow_agent_start");
    expect(html).toContain("Context item title");
    expect(html).toContain("active constraint");
    expect(html).toContain("sha256:delivered");
    expect(html).toContain("node.created");
    expect(html).toContain("Cartographer");
    expect(html).toContain("attach_evidence");
    expect(html).toContain("pending_review");
    expect(html).toContain("Cartographer pending review evidence");
    expect(html).toContain("source_ref_confirmed");
    expect(html).toContain("Seed cartographer window summary");
    expect(html).toContain("workflow_cursor_003");
    expect(html).toContain("Accept");
    expect(html).toContain("Reject");
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
        workflowDefinitionId: "",
        workflowExecutionId: "",
        workflowNodeId: "",
        workflowNodeExecutionId: "",
        runItemId: "",
        reassignedFromIntervalId: "",
        workspaceId: "workspace_test",
      },
    ],
    cartographerCursors: [cartographerCursor()],
    cartographerPatches: [cartographerPatchRecord()],
    cartographerRuns: [cartographerRun()],
    cartographerWindows: [cartographerWindow()],
    contextPackHistory: [
      {
        createdAt: "2026-06-10T12:00:07Z",
        createdByEventId: "event_pack",
        authoredPromptHash: "sha256:authored",
        deliveredContext:
          "Setta semantic context pack pack_node\n\n- Constraint: Context item title",
        deliveredContextHash: "sha256:delivered",
        id: "pack_node",
        itemCount: 1,
        items: [
          {
            activityIntervalId: "",
            createdAt: "2026-06-10T12:00:06Z",
            evidenceAnchorId: "evidence_node",
            estimatedTokens: 24,
            itemId: "pack_node_item_01",
            kind: "constraint",
            priority: "required",
            reasonIncluded: "active constraint",
            semanticNodeId: "node_contract",
            sourceRefs: {
              chatConversationId: "",
              chatMessageId: "",
              chatRunId: "run_detail",
              runItemId: "",
              workflowDefinitionId: "",
              workflowExecutionId: "",
              workflowNodeExecutionId: "",
              workflowNodeId: "",
            },
            steeringDirectiveId: "",
            summary: "Context pack summary",
            title: "Context item title",
            updatedAt: "2026-06-10T12:00:06Z",
          },
        ],
        sourceRefs: {
          chatConversationId: "",
          chatMessageId: "",
          chatRunId: "run_detail",
          runItemId: "",
          workflowDefinitionId: "",
          workflowExecutionId: "",
          workflowNodeExecutionId: "",
          workflowNodeId: "",
        },
        targetEntityId: "node_contract",
        tokenBudget: 1200,
        estimatedTokens: 42,
        triggerKind: "workflow_agent_start",
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
        workflowDefinitionId: "",
        workflowExecutionId: "",
        workflowNodeId: "",
        workflowNodeExecutionId: "",
        chatConversationId: "",
        chatRunId: "",
        chatMessageId: "",
        runItemId: "",
        reassignedFromAnchorId: "",
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
        chatConversationId: "",
        chatMessageId: "",
        chatRunId: "",
        completedAt: "",
        createdAt: "2026-06-10T12:00:06Z",
        createdByEventId: "event_steering",
        id: "steering_node",
        instruction: "Keep endpoint surface read-only",
        kind: "focus",
        reassignedFromDirectiveId: "",
        runItemId: "",
        scope: "workspace",
        status: "active",
        supersedesDirectiveId: "",
        targetEntityId: "node_contract",
        updatedAt: "2026-06-10T12:00:06Z",
        updatedByEventId: "event_steering",
        workflowDefinitionId: "",
        workflowExecutionId: "",
        workflowNodeExecutionId: "",
        workflowNodeId: "",
        workspaceId: "workspace_test",
      },
    ],
    workspaceId: "workspace_test",
  };
}

function cartographerPatchRecord(): SemanticNodeDetail["cartographerPatches"][number] {
  const patch = cartographerPatch();
  return {
    applicationResult: {
      applied: false,
      appliedAt: "",
      createdSemanticEventIds: [],
      diagnostics: [],
      patchId: patch.patchId,
    },
    appliedAt: "",
    createdAt: "2026-06-10T12:00:08Z",
    createdSemanticEventIds: [],
    id: patch.patchId,
    patch,
    runId: "cartographer_run_detail",
    status: "pending_review",
    validatedAt: "2026-06-10T12:00:08Z",
    validationResult: {
      accepted: true,
      diagnostics: [
        {
          code: "source_ref_confirmed",
          createdAt: "2026-06-10T12:00:08Z",
          id: "cartographer_diagnostic_detail",
          message: "The patch references evidence in the inspected semantic node.",
          patchId: patch.patchId,
          path: "$.patches[0].evidenceRefs",
          runId: "cartographer_run_detail",
          severity: "info",
        },
      ],
      patchId: patch.patchId,
      validatedAt: "2026-06-10T12:00:08Z",
    },
    windowId: "cartographer_window_detail",
    workspaceId: "workspace_test",
  };
}

function cartographerPatch(): SemanticNodeDetail["cartographerPatches"][number]["patch"] {
  const evidenceRefs = [
    {
      evidenceAnchorId: "evidence_node",
      sourceId: "setta_semantic_work_graph_implementation_plan",
      sourceKind: "document" as const,
    },
  ];
  return {
    causationId: "cartographer_request_detail",
    confidence: 0.42,
    correlationId: "cartographer_response_detail",
    evidenceRefs,
    modelInfo: { fixture: "renderer" },
    operation: "attach_evidence",
    patchId: "cartographer_patch_pending",
    payload: {
      activityId: "",
      activityKind: "validating",
      activitySourceId: "",
      activitySourceKind: "file_range",
      edgeId: "",
      edgeKind: "supports",
      evidenceAnchorId: "",
      evidenceRefs,
      fromNodeId: "",
      label: "",
      newNode: null,
      newNodes: [],
      reassignments: emptyReassignments(),
      resolutionNodeId: "",
      semanticNodeId: "",
      sourceNodeId: "",
      sourceNodeIds: [],
      summary: "",
      targetEntityId: "node_contract",
      targetNode: null,
      toNodeId: "",
    },
    publicSummary: "Cartographer pending review evidence",
    reviewRequired: true,
    sourceRefs: cartographerSourceRefs(),
    workspaceId: "workspace_test",
  };
}

function cartographerRun(): SemanticNodeDetail["cartographerRuns"][number] {
  return {
    completedAt: "",
    createdAt: "2026-06-10T12:00:08Z",
    createdSemanticEventIds: [],
    diagnostics: [],
    error: "",
    harnessKind: "scripted",
    id: "cartographer_run_detail",
    inputBundle: cartographerInputBundle(),
    inputBundleHash: "sha256:cartographer_input",
    inputItemCounts: {
      activity: 1,
      contextPacks: 1,
      evidence: 1,
      existingEdges: 1,
      existingNodes: 1,
      fileChanges: 0,
      newEvents: 1,
      observations: 0,
      observedEventRefs: 1,
      outputSummaries: 1,
      retrievalResults: 0,
      steering: 1,
      testResults: 0,
      toolCalls: 0,
      trajectorySummaries: 0,
    },
    model: "scripted",
    outputSchema: {},
    rawHarnessResponseHash: "sha256:cartographer_response",
    requestId: "cartographer_request_detail",
    responseId: "cartographer_response_detail",
    sourceEpochId: "cartographer_window_detail",
    sourceKey: "workspace_test:workflow_execution:workflow_detail",
    priority: 100,
    leaseOwner: "",
    leaseDeadline: "",
    attemptCount: 1,
    sourceRefs: cartographerSourceRefs(),
    startedAt: "2026-06-10T12:00:08Z",
    status: "pending_review",
    targetEntityId: "node_contract",
    trajectorySummary: "Seed cartographer window summary",
    triggerKind: "manual",
    updatedAt: "2026-06-10T12:00:08Z",
    windowId: "cartographer_window_detail",
    workspaceId: "workspace_test",
  };
}

function cartographerWindow(): SemanticNodeDetail["cartographerWindows"][number] {
  return {
    closedAt: "2026-06-10T12:00:08Z",
    createdAt: "2026-06-10T12:00:08Z",
    cursorId: "cartographer_cursor_detail",
    id: "cartographer_window_detail",
    inputBundle: cartographerInputBundle(),
    openedAt: "2026-06-10T12:00:08Z",
    runId: "cartographer_run_detail",
    sequence: 1,
    sourceId: "workflow_detail",
    sourceKind: "workflow_execution",
    status: "closed",
    summaryId: "cartographer_summary_detail",
    updatedAt: "2026-06-10T12:00:08Z",
    workspaceId: "workspace_test",
  };
}

function cartographerCursor(): SemanticNodeDetail["cartographerCursors"][number] {
  return {
    chatConversationId: "",
    chatRunId: "",
    id: "cartographer_cursor_detail",
    lastChatEventSequence: 0,
    lastChatEventStreamId: "",
    lastOutputOrdinalByRunItem: { run_item_detail: 3 },
    lastWindowId: "cartographer_window_detail",
    lastWorkflowEventCursor: "workflow_cursor_003",
    updatedAt: "2026-06-10T12:00:08Z",
    workflowExecutionId: "workflow_detail",
    workflowNodeExecutionId: "",
    workspaceId: "workspace_test",
  };
}

function cartographerInputBundle(): SemanticNodeDetail["cartographerRuns"][number]["inputBundle"] {
  return {
    activity: [],
    assistantResponseSummary: "",
    assistantText: "",
    contextPacks: [],
    evidence: [],
    existingEdges: [],
    existingNodes: [],
    fileChanges: [],
    newEvents: [
      {
        boundary: true,
        chatMessageId: "",
        closeReason: "manual",
        eventId: "manual_cartographer_request",
        includedContentBytes: 72,
        messageRole: "",
        messageStatus: "",
        occurredAt: "2026-06-10T12:00:08Z",
        originalContentBytes: 72,
        outputOrdinal: 0,
        outputStream: "",
        runItemId: "",
        runItemStatus: "",
        runItemType: "",
        runStatus: "completed",
        sequence: 0,
        source: "workflow",
        sourceRefs: cartographerSourceRefs(),
        streamId: "",
        summary: "Seed cartographer window summary",
        truncated: false,
        type: "cartographer.manual_current_progress",
        workflowEventCursor: "workflow_cursor_003",
      },
    ],
    observations: [],
    observedEventRefs: ["workflow_cursor_003"],
    outputSummaries: [
      {
        endOrdinal: 3,
        runItemId: "run_item_detail",
        startOrdinal: 1,
        stream: "stdout",
        summary: "Seed cartographer window summary",
        truncated: false,
      },
    ],
    promptSummary: "Seed cartographer window summary",
    promptText: "",
    retrievalResults: [],
    runStatus: "completed",
    sourceRefs: cartographerSourceRefs(),
    steering: [],
    targetEntityId: "node_contract",
    terminalReason: "manual",
    testResults: [],
    tokenBudget: 1200,
    toolCalls: [],
    trajectorySummaries: [],
    triggerKind: "manual",
    truncation: {
      deterministicSummary: "",
      includedContentBytes: 72,
      includedEventCount: 1,
      originalContentBytes: 72,
      originalEventCount: 1,
      reasons: [],
      segmentCount: 1,
      segmentIndex: 0,
      split: false,
      summarized: false,
    },
    windowEndCursor: {
      chatEventSequence: 0,
      chatEventStreamId: "",
      outputOrdinalByRunItem: { run_item_detail: 3 },
      workflowEventCursor: "workflow_cursor_003",
    },
    windowId: "cartographer_window_detail",
    windowStartCursor: {
      chatEventSequence: 0,
      chatEventStreamId: "",
      outputOrdinalByRunItem: {},
      workflowEventCursor: "workflow_cursor_001",
    },
    workspaceId: "workspace_test",
  };
}

function cartographerSourceRefs() {
  return {
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: "",
    runItemId: "",
    workflowDefinitionId: "",
    workflowExecutionId: "workflow_detail",
    workflowNodeExecutionId: "",
    workflowNodeId: "",
  };
}

function emptyReassignments() {
  return {
    activity: [],
    edges: [],
    evidence: [],
    layout: [],
    steering: [],
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
