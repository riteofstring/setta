import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseWorkflowGraphRecordingIncidentReport,
  workflowGraphRecordingIncidentReportMarkdown,
} from "./workflow-graph-recording-incident-report.mjs";

test("parseWorkflowGraphRecordingIncidentReport summarizes required graph incidents", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "setta-graph-incident-report-"));
  try {
    await writeJsonLines(join(artifactDir, "renderer-events.jsonl"), completeGraphEvents());
    await writeJson(join(artifactDir, "pan-zoom-input-samples.json"), [
      {
        at: "2026-06-20T12:00:00.010Z",
        dispatched: [{ deltaX: 4 }, { deltaX: 8 }],
        kind: "wheel-burst",
        renderDeltas: {
          graphUpdateCount: 0,
          wheelInputEventCount: 2,
        },
      },
    ]);
    await writeJson(join(artifactDir, "pan-zoom-performance-observer.json"), {
      completedInputs: [
        {
          cameraInput: true,
          causalSource: "camera:wheel-burst",
          durationMs: 24,
          endedAt: 34,
          kind: "wheel-burst",
          startedAt: 10,
          token: 1,
        },
      ],
      longTasks: [{ duration: 44, name: "self", startTime: 18 }],
      paneMutations: [{ causalSource: "camera:wheel-burst" }],
      reactCommits: [],
      userTimings: [
        inputStartMark({ cameraInput: true, kind: "wheel-burst", token: 1 }),
        {
          duration: 3,
          entryType: "measure",
          name: "setta.workflow-graph.camera-transform",
          startTime: 14,
        },
        inputEndMark({ durationMs: 24, token: 1 }),
      ],
    });
    await writeJson(join(artifactDir, "pan-zoom-debug-snapshots.json"), [
      fixtureDebugSnapshot({ visibleLabels: 2 }),
      fixtureDebugSnapshot({ visibleLabels: 1 }),
    ]);
    await writeJson(join(artifactDir, "pan-zoom-cdp-trace-summary.json"), {
      topCompleteEvents: [{ category: "toplevel", durationMs: 44, name: "RunTask" }],
      topLevelTasks: [],
    });

    const report = await parseWorkflowGraphRecordingIncidentReport({
      artifactDir,
      requiredIncidents: [
        "graph_replacement",
        "node_drag",
        "pan_zoom",
        "selection",
        "sprite_click",
      ],
    });
    const markdown = workflowGraphRecordingIncidentReportMarkdown(report);

    assert.equal(report.status, "passed");
    assert.deepEqual([...new Set(report.incidents.map((incident) => incident.kind))].sort(), [
      "graph_replacement",
      "node_drag",
      "pan_zoom",
      "selection",
      "sprite_click",
    ]);
    assert.match(markdown, /Pan\/zoom/);
    assert.match(markdown, /Node drag/);
    assert.match(markdown, /sprite_review/);
    assert.equal(
      report.incidents.find((incident) => incident.kind === "pan_zoom").timing.longTasks.length,
      1,
    );
    assert.equal(
      report.incidents.find((incident) => incident.kind === "node_drag").layoutSaves.length,
      1,
    );
  } finally {
    await rm(artifactDir, { force: true, recursive: true });
  }
});

test("parseWorkflowGraphRecordingIncidentReport fails when required movement evidence is missing", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "setta-graph-incident-report-missing-"));
  try {
    await writeJsonLines(join(artifactDir, "renderer-events.jsonl"), [
      graphInteractionEvent({
        interaction: {
          ...baseInteraction("node_drag", "commit"),
          movementOwner: "workflow_view_layout",
          movedNodes: [],
          reason: "pointerup",
        },
      }),
    ]);

    await assert.rejects(
      () =>
        parseWorkflowGraphRecordingIncidentReport({
          artifactDir,
          requiredIncidents: ["node_drag"],
        }),
      /node-drag-moved-node-positions-present/,
    );
  } finally {
    await rm(artifactDir, { force: true, recursive: true });
  }
});

function completeGraphEvents() {
  return [
    graphInteractionEvent({
      at: "2026-06-20T12:00:00.020Z",
      interaction: {
        ...baseInteraction("selection", "commit"),
        affectedNodeIds: ["reviewer"],
        reason: "set",
      },
      selectedNodeIds: ["reviewer"],
    }),
    graphInteractionEvent({
      at: "2026-06-20T12:00:00.030Z",
      interaction: {
        ...baseInteraction("node_drag", "commit"),
        affectedNodeIds: ["reviewer"],
        movementOwner: "workflow_view_layout",
        movedNodes: [
          {
            movementOwner: "workflow_view_layout",
            nodeId: "reviewer",
            oldX: 10,
            oldY: 20,
            x: 42,
            y: 64,
          },
        ],
        reason: "pointerup",
      },
    }),
    graphLayoutSaveEvent({
      at: "2026-06-20T12:00:00.040Z",
      layoutSave: {
        affectedNodeIds: ["reviewer"],
        error: "",
        generation: 3,
        owner: "workflow_view_layout",
        owners: ["workflow_view_layout"],
        phase: "succeeded",
        status: "persisted",
        target: null,
      },
    }),
    graphInteractionEvent({
      at: "2026-06-20T12:00:00.050Z",
      interaction: {
        ...baseInteraction("activity_sprite", "commit"),
        affectedNodeIds: ["reviewer"],
        popoverRunItemId: "run_item_review",
        reason: "pointertap",
        sourceNodeId: "reviewer",
        spriteChatRunId: "chat_run_review",
        spriteId: "sprite_review",
        spriteRunItemId: "run_item_review",
        targetNodeId: "reviewer",
      },
    }),
    graphInteractionEvent({
      at: "2026-06-20T12:00:00.060Z",
      interaction: {
        ...baseInteraction("activity_sprite", "commit"),
        affectedNodeIds: ["reviewer"],
        popoverRunItemId: "run_item_review",
        reason: "details_link",
        sourceNodeId: "reviewer",
        spriteChatRunId: "chat_run_review",
        spriteId: "sprite_review",
        spriteRunItemId: "run_item_review",
        targetNodeId: "reviewer",
      },
    }),
    graphReplacementEvent({
      at: "2026-06-20T12:00:00.070Z",
      replacement: {
        activeInteraction: "camera",
        graphVersion: 7,
        phase: "queued",
        reason: "camera_moving",
      },
    }),
  ];
}

function graphInteractionEvent({
  at = "2026-06-20T12:00:00.000Z",
  interaction,
  selectedNodeIds = [],
}) {
  return {
    at,
    graph: graphState({ selectedNodeIds }),
    interaction,
    surfaceId: "surface_incident",
    type: "graph_interaction",
    url: "app://setta",
  };
}

function graphLayoutSaveEvent({ at, layoutSave }) {
  return {
    at,
    graph: graphState({}),
    layoutSave,
    surfaceId: "surface_incident",
    type: "graph_layout_save",
    url: "app://setta",
  };
}

function graphReplacementEvent({ at, replacement }) {
  return {
    at,
    graph: graphState({}),
    replacement,
    surfaceId: "surface_incident",
    type: "graph_replacement",
    url: "app://setta",
  };
}

function baseInteraction(kind, phase) {
  return {
    affectedNodeIds: [],
    kind,
    movementOwner: "",
    movedNodes: [],
    phase,
    pointerType: "",
    popoverRunItemId: "",
    reason: "",
    sourceNodeId: "",
    sourcePortId: "",
    spriteChatRunId: "",
    spriteId: "",
    spriteRunItemId: "",
    spriteWorkflowExecutionId: "",
    spriteWorkflowNodeExecutionId: "",
    targetNodeId: "",
    targetPortId: "",
  };
}

function graphState({ selectedNodeIds = [] }) {
  const selected = selectedNodeIds.map((nodeId) => ({
    ...nodeSummary(nodeId),
    selected: true,
  }));
  return {
    camera: { x: 0, y: 0, zoom: 1 },
    counts: {
      edges: 1,
      materializedNodes: 2,
      movedNodes: 0,
      nodes: 2,
      selectedEdges: 0,
      selectedNodes: selectedNodeIds.length,
      trajectorySprites: 1,
      visibleNodes: 2,
    },
    lastLayoutSave: null,
    nodes: {
      moved: [],
      selected,
      touched: [],
      visible: [nodeSummary("reviewer"), nodeSummary("semantic:phase7")],
    },
    pendingLayout: {
      generation: null,
      writeCount: 0,
    },
    schemaVersion: 2,
    selected: {
      edgeIds: [],
      nodeIds: selectedNodeIds,
    },
    surfaceId: "surface_incident",
    timing: null,
    trajectory: {
      anchorSummaries: [],
      anchors: null,
      displayCount: 1,
      frameRevision: 1,
      groupCount: 1,
      recentLaneCount: 0,
      totalCount: 1,
    },
    truncation: [],
    visibility: {
      edges: visibilitySummary(1, 1, { drawn: 1 }),
      labels: visibilitySummary(2, 2, { "all-visible": 2 }),
      nodes: visibilitySummary(2, 2, { materialized: 2 }),
      sprites: visibilitySummary(1, 1, { displayed: 1 }),
    },
    workflow: null,
  };
}

function nodeSummary(id) {
  return {
    id,
    kind: "action",
    labelVisibilityReason: "all-visible",
    labelVisible: true,
    layer: id.startsWith("semantic:") ? "semantic" : "workflow",
    materialized: true,
    moved: false,
    movementOwner: "workflow_view_layout",
    screenX: 10,
    screenY: 20,
    selected: false,
    status: "ready",
    visible: true,
    x: 10,
    y: 20,
  };
}

function visibilitySummary(total, visible, visibleReasons) {
  return {
    hidden: total - visible,
    hiddenReasons: total - visible > 0 ? { hidden: total - visible } : {},
    total,
    visible,
    visibleReasons,
  };
}

function fixtureDebugSnapshot({ visibleLabels }) {
  return {
    snapshot: {
      graph: {
        edgeCount: 1,
        nodeCount: 2,
        nodes: [
          { label: { visible: true, visibilityReason: "all-visible" } },
          { label: { visible: visibleLabels > 1, visibilityReason: "decluttered" } },
        ],
      },
      render: {
        lastDrawnEdgeCount: 1,
        lastVisibleMaterializedNodeCount: 2,
        materializedLabelCount: 2,
        materializedNodeCount: 2,
        trajectorySpriteDisplayCount: 1,
        trajectorySpriteTotalCount: 1,
        visibleLabelCount: visibleLabels,
      },
    },
  };
}

function inputStartMark({ cameraInput, kind, token }) {
  return {
    detail: {
      cameraInput,
      causalSource: cameraInput ? `camera:${kind}` : `interaction:${kind}`,
      kind,
      startedAt: 10,
      token,
    },
    entryType: "mark",
    name: "setta.workflow-graph.input.start",
    startTime: 10,
  };
}

function inputEndMark({ durationMs, token }) {
  return {
    detail: {
      durationMs,
      endedAt: 10 + durationMs,
      token,
    },
    entryType: "mark",
    name: "setta.workflow-graph.input.end",
    startTime: 10 + durationMs,
  };
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

async function writeJsonLines(path, values) {
  await writeFile(path, values.map((value) => JSON.stringify(value)).join("\n") + "\n");
}
