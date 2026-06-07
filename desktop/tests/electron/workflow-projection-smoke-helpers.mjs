import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function createWorkflowProjectionFixture(client, workspaceRoot) {
  const fixture = await client.evaluate(`(async () => {
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
      "Workflow graph projection",
      "Renderer projection smoke fixture",
      graph
    );
    return {
      definitionId: definition.id,
      definitionName: definition.name,
      layout,
      workspaceId
    };
  })()`);
  await assertWorkflowDefinitionFile(
    workspaceRoot,
    fixture.definitionId,
    "Workflow graph projection",
  );
  return fixture;
}

export function isWorkflowProjectionSnapshotReady(snapshot, expected) {
  return (
    isWorkflowGraphSnapshotRendered(snapshot) &&
    isWorkflowProjectionMetadataReady(snapshot, expected)
  );
}

function isWorkflowGraphSnapshotRendered(snapshot) {
  return (
    snapshot.canvas.clientWidth > 0 &&
    snapshot.canvas.clientHeight > 0 &&
    snapshot.render.frameCount > 2 &&
    snapshot.visual.hasNonBackgroundPixels
  );
}

function isWorkflowProjectionMetadataReady(snapshot, expected) {
  const actual = workflowProjectionMetadata(snapshot);
  return (
    actual !== null && JSON.stringify(actual) === JSON.stringify(expectedDraftMetadata(expected))
  );
}

export function assertWorkflowProjectionSnapshot(snapshot, expected) {
  const actual = workflowProjectionMetadata(snapshot);
  if (actual === null) {
    throw new Error(
      `Workflow graph did not expose workflow projection metadata: ${JSON.stringify(snapshot.graph)}`,
    );
  }
  const expectedMetadata = expectedDraftMetadata(expected);
  if (JSON.stringify(actual) !== JSON.stringify(expectedMetadata)) {
    throw new Error(
      `Workflow graph projection metadata mismatch: expected=${JSON.stringify(expectedMetadata)} snapshot=${JSON.stringify(actual)}`,
    );
  }
  assertWorkflowProjectionIDs(
    snapshot.graph.nodes,
    ["start", "work", "end"],
    "node",
    "Workflow graph projection nodes",
  );
  assertWorkflowProjectionIDs(
    snapshot.graph.edges,
    ["start_work", "work_end"],
    "edge",
    "Workflow graph projection edges",
  );
  assertWorkflowProjectionLayout(snapshot.graph.nodes, expected.layout);
}

function workflowProjectionMetadata(snapshot) {
  const workflow = snapshot.graph.workflow;
  if (!workflow) {
    return null;
  }
  return {
    definitionId: workflow.definitionId,
    definitionName: workflow.definitionName,
    definitionVersionId: workflow.definitionVersionId,
    definitionVersionNumber: workflow.definitionVersionNumber,
    editable: workflow.editable,
    executionId: workflow.executionId,
    executionStatus: workflow.executionStatus,
    versionMismatch: workflow.versionMismatch,
    viewMode: workflow.viewMode,
    workspaceId: workflow.workspaceId,
  };
}

function expectedDraftMetadata(expected) {
  return {
    definitionId: expected.definitionId,
    definitionName: expected.definitionName,
    definitionVersionId: "",
    definitionVersionNumber: 0,
    editable: true,
    executionId: "",
    executionStatus: "",
    versionMismatch: false,
    viewMode: "draft",
    workspaceId: expected.workspaceId,
  };
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
        `Workflow graph projection layout mismatch for ${expected.nodeId}: actual=${JSON.stringify(node)} expected=${JSON.stringify(expected)}`,
      );
    }
  }
}

async function assertWorkflowDefinitionFile(workspaceRoot, definitionId, expectedName) {
  const workflowDir = join(workspaceRoot, ".setta", "workflows");
  const entries = await readdir(workflowDir);
  const matches = entries.filter((entry) => entry.endsWith(`--${definitionId}.json`));
  if (matches.length !== 1) {
    throw new Error(
      `workflow definition file mismatch for ${definitionId}: entries=${JSON.stringify(entries)}`,
    );
  }

  const raw = await readFile(join(workflowDir, matches[0]), "utf8");
  const saved = JSON.parse(raw);
  assertWorkflowDefinitionFileIdentity(saved, definitionId, expectedName, raw);
  assertWorkflowDefinitionFileOmitsRuntimeFields(saved, raw);
  assertWorkflowDefinitionFileGraph(saved, raw);
}

function assertWorkflowDefinitionFileIdentity(saved, definitionId, expectedName, raw) {
  if (saved.id !== definitionId || saved.name !== expectedName || saved.schemaVersion !== 1) {
    throw new Error(`workflow definition file content mismatch: ${raw}`);
  }
}

function assertWorkflowDefinitionFileOmitsRuntimeFields(saved, raw) {
  for (const forbidden of [
    "workspaceId",
    "currentVersionId",
    "currentVersionNumber",
    "createdAt",
    "updatedAt",
  ]) {
    if (Object.hasOwn(saved, forbidden)) {
      throw new Error(`workflow definition file should not contain ${forbidden}: ${raw}`);
    }
  }
}

function assertWorkflowDefinitionFileGraph(saved, raw) {
  if (saved.graph?.nodes?.length !== 3 || saved.graph?.edges?.length !== 2) {
    throw new Error(`workflow definition graph was not saved: ${raw}`);
  }
}
