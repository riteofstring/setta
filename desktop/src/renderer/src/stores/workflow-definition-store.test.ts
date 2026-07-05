import type {
  ListWorkflowDefinitionsResponse,
  WorkflowDefinition,
  WorkflowEvent,
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

  test("refreshes a loaded active workspace list when a definition event arrives", async () => {
    const listDefinitions = vi.fn().mockResolvedValue({
      definitions: [workflowDefinition("definition_created", "Created while collapsed")],
    } satisfies ListWorkflowDefinitionsResponse);
    installWorkflowAPI({ listDefinitions });
    useWorkflowDefinitionStore.setState({
      selectedDefinitionIdsByWorkspaceId: { workspace_local: "definition_existing" },
      workflowDefinitionsByWorkspaceId: {
        workspace_local: {
          definitions: [workflowDefinition("definition_existing", "Existing workflow")],
          error: null,
          loading: false,
        },
      },
    });

    await useWorkflowDefinitionStore
      .getState()
      .handleWorkflowDefinitionEvent(
        workflowEvent({ type: "workflow_definition.created" }),
        new Set(["workspace_local"]),
      );

    expect(listDefinitions).toHaveBeenCalledWith("workspace_local");
    expect(
      useWorkflowDefinitionStore.getState().workflowDefinitionsByWorkspaceId.workspace_local,
    ).toMatchObject({
      definitions: [expect.objectContaining({ id: "definition_created" })],
      error: null,
      loading: false,
    });
    expect(
      useWorkflowDefinitionStore.getState().selectedDefinitionIdsByWorkspaceId.workspace_local,
    ).toBe("definition_created");
  });

  test("ignores definition events for inactive workspaces", async () => {
    const listDefinitions = vi.fn().mockResolvedValue({
      definitions: [workflowDefinition("definition_created", "Created elsewhere")],
    } satisfies ListWorkflowDefinitionsResponse);
    installWorkflowAPI({ listDefinitions });
    useWorkflowDefinitionStore.setState({
      workflowDefinitionsByWorkspaceId: {
        workspace_local: {
          definitions: [workflowDefinition("definition_existing", "Existing workflow")],
          error: null,
          loading: false,
        },
      },
    });

    await useWorkflowDefinitionStore
      .getState()
      .handleWorkflowDefinitionEvent(
        workflowEvent({ type: "workflow_definition.created" }),
        new Set(["workspace_other"]),
      );

    expect(listDefinitions).not.toHaveBeenCalled();
    expect(
      useWorkflowDefinitionStore.getState().workflowDefinitionsByWorkspaceId.workspace_local,
    ).toMatchObject({
      definitions: [expect.objectContaining({ id: "definition_existing" })],
      error: null,
      loading: false,
    });
  });

  test("keeps the newest workflow definition refresh when an older request resolves last", async () => {
    const first = deferred<ListWorkflowDefinitionsResponse>();
    const second = deferred<ListWorkflowDefinitionsResponse>();
    installWorkflowAPI({
      listDefinitions: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    });

    const firstRefresh = useWorkflowDefinitionStore
      .getState()
      .refreshWorkspaceWorkflowDefinitions("workspace_local");
    const eventRefresh = useWorkflowDefinitionStore
      .getState()
      .handleWorkflowDefinitionEvent(
        workflowEvent({ type: "workflow_definition.updated" }),
        new Set(["workspace_local"]),
      );

    second.resolve({
      definitions: [workflowDefinition("definition_new", "Newest workflow")],
    });
    await eventRefresh;

    first.resolve({
      definitions: [workflowDefinition("definition_old", "Older workflow")],
    });
    await firstRefresh;

    expect(
      useWorkflowDefinitionStore.getState().workflowDefinitionsByWorkspaceId.workspace_local,
    ).toMatchObject({
      definitions: [expect.objectContaining({ id: "definition_new" })],
      error: null,
      loading: false,
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

function workflowEvent(overrides: Partial<WorkflowEvent> = {}): WorkflowEvent {
  return {
    createdAt: "2026-07-03T12:00:00Z",
    definitionId: "definition_event",
    definitionName: "Event workflow",
    definitionVersionId: "",
    details: {},
    executionId: "",
    id: "workflow_event",
    message: "",
    nodeExecutionId: "",
    nodeId: "",
    ordinal: 0,
    runnerKind: null,
    schemaVersion: 1,
    tokenId: "",
    type: "workflow_definition.created",
    workspaceId: "workspace_local",
    ...overrides,
  };
}

function emptyWorkflowGraph(): WorkflowGraph {
  return {
    agentDefaults: { model: "", permission: null, reasoningEffort: null },
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
