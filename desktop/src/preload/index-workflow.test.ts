import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { WorkflowEvent, WorkflowGraph } from "@generated/backend";
import { ipcChannels, ipcEvents } from "@shared/ipc";

async function exposePreloadAPI({
  invoke = vi.fn(),
  on = vi.fn(),
  removeListener = vi.fn(),
  send = vi.fn(),
} = {}) {
  const exposed: Record<string, unknown> = {};
  vi.doMock("electron", () => ({
    contextBridge: {
      exposeInMainWorld: (name: string, api: unknown) => {
        exposed[name] = api;
      },
    },
    ipcRenderer: {
      invoke,
      on,
      removeListener,
      send,
    },
  }));

  await import("./index");

  return { api: exposed.setta as SettaAPI, invoke, on, removeListener, send };
}

describe("preload workflow API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
    vi.unstubAllEnvs();
    vi.stubEnv("SETTA_E2E", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_DEBUG", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT", "");
  });

  test("exposes typed workflow methods through IPC", async () => {
    const { api, invoke, on, removeListener } = await exposePreloadAPI();
    const graph = workflowGraph();
    expect(Object.keys(api.workflow).sort()).toEqual([
      "addEdge",
      "addNode",
      "cancelExecution",
      "createDefinition",
      "deleteDefinition",
      "deleteEdges",
      "deleteNodes",
      "executionEvents",
      "graphProjection",
      "listDefinitions",
      "onEvent",
      "readDefinition",
      "readExecution",
      "startExecution",
      "submitApproval",
      "updateDefinition",
      "updateDefinitionLayout",
      "updateDefinitionSettings",
      "updateEdge",
      "updateNode",
      "validateDefinition",
      "validateDefinitionDraft",
    ]);

    await api.workflow.listDefinitions("workspace_api");
    await api.workflow.addNode({
      definitionId: "workflow_definition_api",
      expectedRevision: "revision_api",
      nodeType: "agent_task",
      position: { x: 10, y: 20 },
      workspaceId: "workspace_api",
    });
    await api.workflow.addEdge({
      connection: {
        sourceNodeId: "start",
        sourcePortId: "",
        targetNodeId: "work",
        targetPortId: "",
      },
      definitionId: "workflow_definition_api",
      expectedRevision: "revision_api",
      workspaceId: "workspace_api",
    });
    await api.workflow.createDefinition("workspace_api", "Review", "phase 4", graph);
    await api.workflow.readDefinition("workspace_api", "workflow_definition_api");
    await api.workflow.updateDefinition({
      definitionId: "workflow_definition_api",
      description: "phase 4 updated",
      expectedRevision: "revision_api",
      graph,
      name: "Review updated",
      workspaceId: "workspace_api",
    });
    await api.workflow.deleteNodes({
      definitionId: "workflow_definition_api",
      expectedRevision: "revision_api",
      nodeIds: ["work"],
      workspaceId: "workspace_api",
    });
    await api.workflow.deleteEdges({
      definitionId: "workflow_definition_api",
      edgeIds: ["start_work"],
      expectedRevision: "revision_api",
      workspaceId: "workspace_api",
    });
    await api.workflow.deleteDefinition("workspace_api", "workflow_definition_api");
    await api.workflow.validateDefinition("workspace_api", graph);
    await api.workflow.validateDefinitionDraft({
      definitionId: "workflow_definition_api",
      expectedRevision: "revision_api",
      workspaceId: "workspace_api",
    });
    await api.workflow.updateDefinitionLayout({
      definitionId: "workflow_definition_api",
      expectedRevision: "revision_api",
      positions: [{ nodeId: "start", x: 10, y: 20 }],
      workspaceId: "workspace_api",
    });
    await api.workflow.updateDefinitionSettings({
      definitionId: "workflow_definition_api",
      description: "phase 4 updated",
      expectedRevision: "revision_api",
      name: "Review updated",
      workspaceId: "workspace_api",
    });
    await api.workflow.updateNode({
      definitionId: "workflow_definition_api",
      expectedRevision: "revision_api",
      node: graph.nodes[0]!,
      workspaceId: "workspace_api",
    });
    await api.workflow.updateEdge({
      definitionId: "workflow_definition_api",
      edge: graph.edges[0]!,
      expectedRevision: "revision_api",
      workspaceId: "workspace_api",
    });
    await api.workflow.startExecution("workspace_api", "workflow_definition_api");
    await api.workflow.startExecution(
      "workspace_api",
      "workflow_definition_api",
      "workflow_version_api",
    );
    await api.workflow.cancelExecution("workspace_api", "workflow_execution_api");
    await api.workflow.readExecution("workspace_api", "workflow_execution_api");
    await api.workflow.executionEvents("workspace_api", "workflow_execution_api", 10, 20);
    await api.workflow.graphProjection("workspace_api");
    await api.workflow.graphProjection(
      "workspace_api",
      "workflow_definition_api",
      "workflow_version_api",
      "workflow_execution_api",
    );
    await api.workflow.submitApproval({
      answers: [],
      approvalId: "approval_api",
      approved: true,
      cancelled: false,
      executionId: "workflow_execution_api",
      nodeExecutionId: "workflow_node_execution_api",
      response: "",
      workspaceId: "workspace_api",
    });

    const event = workflowEvent();
    const listener = vi.fn();
    const unsubscribe = api.workflow.onEvent(listener);
    const handler = on.mock.calls.find((call) => call[0] === ipcEvents.workflowEvent)?.[1];
    if (typeof handler !== "function") {
      throw new Error("workflow event handler was not registered");
    }
    handler({}, event);
    unsubscribe();

    expectInvokeCalls(invoke, [
      [ipcChannels.workflowListDefinitions, "workspace_api"],
      [
        ipcChannels.workflowAddNode,
        {
          definitionId: "workflow_definition_api",
          expectedRevision: "revision_api",
          nodeType: "agent_task",
          position: { x: 10, y: 20 },
          workspaceId: "workspace_api",
        },
      ],
      [
        ipcChannels.workflowAddEdge,
        {
          connection: {
            sourceNodeId: "start",
            sourcePortId: "",
            targetNodeId: "work",
            targetPortId: "",
          },
          definitionId: "workflow_definition_api",
          expectedRevision: "revision_api",
          workspaceId: "workspace_api",
        },
      ],
      [ipcChannels.workflowCreateDefinition, "workspace_api", "Review", "phase 4", graph],
      [ipcChannels.workflowReadDefinition, "workspace_api", "workflow_definition_api"],
      [
        ipcChannels.workflowUpdateDefinition,
        {
          definitionId: "workflow_definition_api",
          description: "phase 4 updated",
          expectedRevision: "revision_api",
          graph,
          name: "Review updated",
          workspaceId: "workspace_api",
        },
      ],
      [
        ipcChannels.workflowDeleteNodes,
        {
          definitionId: "workflow_definition_api",
          expectedRevision: "revision_api",
          nodeIds: ["work"],
          workspaceId: "workspace_api",
        },
      ],
      [
        ipcChannels.workflowDeleteEdges,
        {
          definitionId: "workflow_definition_api",
          edgeIds: ["start_work"],
          expectedRevision: "revision_api",
          workspaceId: "workspace_api",
        },
      ],
      [ipcChannels.workflowDeleteDefinition, "workspace_api", "workflow_definition_api"],
      [ipcChannels.workflowValidateDefinition, "workspace_api", graph],
      [
        ipcChannels.workflowValidateDefinitionDraft,
        {
          definitionId: "workflow_definition_api",
          expectedRevision: "revision_api",
          workspaceId: "workspace_api",
        },
      ],
      [
        ipcChannels.workflowUpdateDefinitionLayout,
        {
          definitionId: "workflow_definition_api",
          expectedRevision: "revision_api",
          positions: [{ nodeId: "start", x: 10, y: 20 }],
          workspaceId: "workspace_api",
        },
      ],
      [
        ipcChannels.workflowUpdateDefinitionSettings,
        {
          definitionId: "workflow_definition_api",
          description: "phase 4 updated",
          expectedRevision: "revision_api",
          name: "Review updated",
          workspaceId: "workspace_api",
        },
      ],
      [
        ipcChannels.workflowUpdateNode,
        {
          definitionId: "workflow_definition_api",
          expectedRevision: "revision_api",
          node: graph.nodes[0]!,
          workspaceId: "workspace_api",
        },
      ],
      [
        ipcChannels.workflowUpdateEdge,
        {
          definitionId: "workflow_definition_api",
          edge: graph.edges[0]!,
          expectedRevision: "revision_api",
          workspaceId: "workspace_api",
        },
      ],
      [ipcChannels.workflowStartExecution, "workspace_api", "workflow_definition_api", ""],
      [
        ipcChannels.workflowStartExecution,
        "workspace_api",
        "workflow_definition_api",
        "workflow_version_api",
      ],
      [ipcChannels.workflowCancelExecution, "workspace_api", "workflow_execution_api"],
      [ipcChannels.workflowReadExecution, "workspace_api", "workflow_execution_api"],
      [ipcChannels.workflowExecutionEvents, "workspace_api", "workflow_execution_api", 10, 20],
      [ipcChannels.workflowGraphProjection, "workspace_api", "", "", ""],
      [
        ipcChannels.workflowGraphProjection,
        "workspace_api",
        "workflow_definition_api",
        "workflow_version_api",
        "workflow_execution_api",
      ],
      [
        ipcChannels.workflowSubmitApproval,
        {
          answers: [],
          approvalId: "approval_api",
          approved: true,
          cancelled: false,
          executionId: "workflow_execution_api",
          nodeExecutionId: "workflow_node_execution_api",
          response: "",
          workspaceId: "workspace_api",
        },
      ],
    ]);
    expect(on).toHaveBeenCalledWith(ipcEvents.workflowEvent, expect.any(Function));
    expect(listener).toHaveBeenCalledWith(event);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.workflowEvent, handler);
  });
});

function expectInvokeCalls(invoke: ReturnType<typeof vi.fn>, calls: unknown[][]) {
  expect(invoke).toHaveBeenCalledTimes(calls.length);
  for (const call of calls) {
    expect(invoke).toHaveBeenCalledWith(...call);
  }
}

function workflowEvent(): WorkflowEvent {
  return {
    createdAt: "2026-06-05T12:00:00Z",
    definitionId: "workflow_definition_api",
    definitionVersionId: "workflow_version_api",
    details: {},
    executionId: "workflow_execution_api",
    id: "workflow_event_api",
    message: "workflow started",
    nodeExecutionId: "",
    nodeId: "",
    ordinal: 1,
    runnerKind: null,
    schemaVersion: 1,
    tokenId: "",
    type: "workflow.execution.started",
    workspaceId: "workspace_api",
  };
}

function workflowGraph(): WorkflowGraph {
  return {
    edges: [
      {
        condition: null,
        fromNodeId: "start",
        id: "start_end",
        kind: "normal",
        toNodeId: "end",
      },
    ],
    layout: { nodes: [] },
    nodes: [
      {
        action: null,
        gateway: null,
        id: "start",
        kind: "start",
        loopGuard: null,
        title: "Start",
      },
      {
        action: null,
        gateway: null,
        id: "end",
        kind: "end",
        loopGuard: null,
        title: "End",
      },
    ],
  };
}
