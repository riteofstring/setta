import type {
  ListWorkflowDefinitionsResponse,
  WorkflowDefinition,
  WorkflowGraph,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useWorkflowDefinitionStore } from "./workflow-definition-store";

describe("workflow definition store runtime reset", () => {
  beforeEach(() => {
    useWorkflowDefinitionStore.setState(useWorkflowDefinitionStore.getInitialState(), true);
    useWorkflowDefinitionStore.getState().resetRuntimeState();
  });

  test("ignores in-flight definition refresh results after reset", async () => {
    const pending = deferred<ListWorkflowDefinitionsResponse>();
    installWorkflowAPI({
      listDefinitions: vi.fn().mockReturnValue(pending.promise),
    });

    const refreshPromise = useWorkflowDefinitionStore
      .getState()
      .refreshWorkspaceWorkflowDefinitions("workspace_local");
    expect(
      useWorkflowDefinitionStore.getState().workflowDefinitionsByWorkspaceId.workspace_local,
    ).toMatchObject({ loading: true });

    useWorkflowDefinitionStore.getState().resetRuntimeState();
    pending.resolve({
      definitions: [workflowDefinition("definition_stale", "Stale workflow")],
    });
    await refreshPromise;

    expect(useWorkflowDefinitionStore.getState()).toMatchObject({
      selectedDefinitionIdsByWorkspaceId: {},
      workflowDefinitionsByWorkspaceId: {},
    });
  });
});

function installWorkflowAPI(workflow: Partial<SettaAPI["workflow"]>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: {
        workflow,
      } as unknown as SettaAPI,
    },
  });
}

function workflowDefinition(id: string, name: string): WorkflowDefinition {
  return {
    createdAt: "2026-07-03T12:00:00Z",
    description: "",
    graph: emptyWorkflowGraph(),
    id,
    name,
    schemaVersion: 1,
    updatedAt: "2026-07-03T12:00:00Z",
    workspaceId: "workspace_local",
  };
}

function emptyWorkflowGraph(): WorkflowGraph {
  return {
    edges: [],
    layout: { nodes: [] },
    nodes: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
