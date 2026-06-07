export async function createWorkflowProjectionFixture(client, workspaceRoot) {
  return client.evaluate(`(async () => {
    const opened = await window.setta.workspace.openPath(${JSON.stringify(workspaceRoot)});
    const workspaceId = opened.workspace.id;
    const layout = {
      nodes: [
        { nodeId: "start", x: -360, y: 0 },
        { nodeId: "work", x: 0, y: 120 },
        { nodeId: "end", x: 360, y: 0 }
      ]
    };
    const graph = {
      nodes: [
        { id: "start", kind: "start", title: "Start", action: null, gateway: null, loopGuard: null },
        {
          id: "work",
          kind: "action",
          title: "Work",
          action: {
            kind: "agent.codex",
            codex: {
              prompt: "workflow result action",
              freshConversation: true,
              model: "",
              reasoningEffort: ""
            }
          },
          gateway: null,
          loopGuard: null
        },
        { id: "end", kind: "end", title: "End", action: null, gateway: null, loopGuard: null }
      ],
      edges: [
        {
          id: "start_work",
          fromNodeId: "start",
          toNodeId: "work",
          kind: "normal",
          condition: null
        },
        {
          id: "work_end",
          fromNodeId: "work",
          toNodeId: "end",
          kind: "normal",
          condition: null
        }
      ],
      layout
    };
    const validation = await window.setta.workflow.validateDefinition(workspaceId, graph);
    if (!validation.valid) {
      throw new Error("workflow projection fixture validation failed: " + JSON.stringify(validation.diagnostics));
    }
    const definition = await window.setta.workflow.createDefinition(
      workspaceId,
      "Pixi workflow projection",
      "Renderer projection smoke fixture",
      graph
    );
    const execution = await window.setta.workflow.startExecution(workspaceId, definition.id);
    return {
      definitionId: definition.id,
      executionId: execution.id,
      layout,
      workspaceId
    };
  })()`);
}

export function isWorkflowProjectionSnapshotReady(snapshot, expected) {
  return isPixiSnapshotRendered(snapshot) && isWorkflowProjectionMetadataReady(snapshot, expected);
}

function isPixiSnapshotRendered(snapshot) {
  return (
    snapshot.canvas.clientWidth > 0 &&
    snapshot.canvas.clientHeight > 0 &&
    snapshot.render.frameCount > 2 &&
    snapshot.visual.hasNonBackgroundPixels
  );
}

function isWorkflowProjectionMetadataReady(snapshot, expected) {
  const workflow = snapshot.graph.workflow;
  return (
    workflow?.executionId === expected.executionId &&
    workflow?.definitionId === expected.definitionId &&
    workflow?.executionStatus === "completed"
  );
}

export function assertWorkflowProjectionSnapshot(snapshot, expected) {
  if (!snapshot.graph.workflow) {
    throw new Error(
      `Pixi graph did not expose workflow projection metadata: ${JSON.stringify(snapshot.graph)}`,
    );
  }
  if (
    snapshot.graph.workflow.workspaceId !== expected.workspaceId ||
    snapshot.graph.workflow.definitionId !== expected.definitionId ||
    snapshot.graph.workflow.executionId !== expected.executionId ||
    snapshot.graph.workflow.executionStatus !== "completed"
  ) {
    throw new Error(
      `Pixi workflow projection metadata mismatch: expected=${JSON.stringify(expected)} snapshot=${JSON.stringify(snapshot.graph.workflow)}`,
    );
  }
  assertWorkflowProjectionIDs(
    snapshot.graph.nodes,
    ["start", "work", "end"],
    "node",
    "Pixi workflow projection nodes",
  );
  assertWorkflowProjectionIDs(
    snapshot.graph.edges,
    ["start_work", "work_end"],
    "edge",
    "Pixi workflow projection edges",
  );
  assertWorkflowProjectionLayout(snapshot.graph.nodes, expected.layout);
}

function assertWorkflowProjectionIDs(items, expectedIDs, itemKind, label) {
  const ids = items.map((item) => item.id).sort();
  const expected = [...expectedIDs].sort();
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} mismatch: ${itemKind}s=${JSON.stringify(ids)} expected=${JSON.stringify(expected)}`,
    );
  }
}

function assertWorkflowProjectionLayout(nodes, expectedLayout) {
  const actual = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  for (const expected of expectedLayout.nodes) {
    const node = actual.get(expected.nodeId);
    if (!node || node.x !== expected.x || node.y !== expected.y) {
      throw new Error(
        `Pixi workflow projection layout mismatch for ${expected.nodeId}: actual=${JSON.stringify(node)} expected=${JSON.stringify(expected)}`,
      );
    }
  }
}
