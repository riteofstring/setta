import type {
  ListWorkflowDefinitionsResponse,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowGraph,
} from "@generated/backend";
import { create } from "zustand";

import { emptyWorkflowGraph } from "../features/workspace-graph/workflow-graph-draft";

export interface WorkflowDefinitionListState {
  definitions: WorkflowDefinition[];
  error: string | null;
  loading: boolean;
}

interface WorkflowDefinitionStore {
  clearClosedWorkspaceWorkflowDefinitions: (activeWorkspaceIds: string[]) => void;
  createWorkflowDefinition: (
    workspaceId: string,
    name?: string,
    graph?: WorkflowGraph,
  ) => Promise<WorkflowDefinition>;
  ensureWorkspaceWorkflowDefinitions: (workspaceId: string) => Promise<void>;
  handleWorkflowDefinitionEvent: (
    event: WorkflowEvent,
    activeWorkspaceIds: ReadonlySet<string>,
  ) => Promise<void>;
  refreshWorkspaceWorkflowDefinitions: (workspaceId: string) => Promise<void>;
  resetRuntimeState: () => void;
  selectWorkflowDefinition: (workspaceId: string, definitionId: string) => void;
  selectedDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
  workflowDefinitionsByWorkspaceId: Record<string, WorkflowDefinitionListState | undefined>;
}

export const useWorkflowDefinitionStore = create<WorkflowDefinitionStore>((set, get) => {
  let generation = 0;
  let nextRefreshRequestId = 0;
  const latestRefreshRequestIdsByWorkspaceId = new Map<string, number>();

  function workflowDefinitionRefreshRequestCurrent(
    requestGeneration: number,
    requestId: number,
    workspaceId: string,
  ) {
    return (
      requestGeneration === generation &&
      latestRefreshRequestIdsByWorkspaceId.get(workspaceId) === requestId
    );
  }

  return {
    clearClosedWorkspaceWorkflowDefinitions: (activeWorkspaceIds) => {
      const active = new Set(activeWorkspaceIds);
      set((state) => ({
        selectedDefinitionIdsByWorkspaceId: retainActiveKeys(
          state.selectedDefinitionIdsByWorkspaceId,
          active,
        ),
        workflowDefinitionsByWorkspaceId: retainActiveKeys(
          state.workflowDefinitionsByWorkspaceId,
          active,
        ),
      }));
    },
    createWorkflowDefinition: async (workspaceId, name = "Untitled workflow", graph) => {
      const requestGeneration = generation;
      const definition = await window.setta.workflow.createDefinition(
        workspaceId,
        name,
        "",
        graph ?? emptyWorkflowGraph(),
      );
      if (requestGeneration !== generation) {
        return definition;
      }
      set((state) => ({
        selectedDefinitionIdsByWorkspaceId: {
          ...state.selectedDefinitionIdsByWorkspaceId,
          [workspaceId]: definition.id,
        },
        workflowDefinitionsByWorkspaceId: {
          ...state.workflowDefinitionsByWorkspaceId,
          [workspaceId]: upsertDefinitionList(
            state.workflowDefinitionsByWorkspaceId[workspaceId],
            definition,
          ),
        },
      }));
      return definition;
    },
    ensureWorkspaceWorkflowDefinitions: async (workspaceId) => {
      const list = get().workflowDefinitionsByWorkspaceId[workspaceId];
      if (list?.loading || (list && list.error === null)) {
        return;
      }
      await get().refreshWorkspaceWorkflowDefinitions(workspaceId);
    },
    handleWorkflowDefinitionEvent: async (event, activeWorkspaceIds) => {
      if (
        !workflowDefinitionEventShouldRefreshDefinitions(event) ||
        !activeWorkspaceIds.has(event.workspaceId)
      ) {
        return;
      }
      await get().refreshWorkspaceWorkflowDefinitions(event.workspaceId);
    },
    refreshWorkspaceWorkflowDefinitions: async (workspaceId) => {
      const requestGeneration = generation;
      const requestId = nextRefreshRequestId;
      nextRefreshRequestId += 1;
      latestRefreshRequestIdsByWorkspaceId.set(workspaceId, requestId);
      set((state) => ({
        workflowDefinitionsByWorkspaceId: {
          ...state.workflowDefinitionsByWorkspaceId,
          [workspaceId]: {
            definitions: state.workflowDefinitionsByWorkspaceId[workspaceId]?.definitions ?? [],
            error: null,
            loading: true,
          },
        },
      }));
      try {
        const response = await window.setta.workflow.listDefinitions(workspaceId);
        if (!workflowDefinitionRefreshRequestCurrent(requestGeneration, requestId, workspaceId)) {
          return;
        }
        set((state) => workflowListLoadedPatch(state, workspaceId, response));
      } catch (error: unknown) {
        if (!workflowDefinitionRefreshRequestCurrent(requestGeneration, requestId, workspaceId)) {
          return;
        }
        set((state) => ({
          workflowDefinitionsByWorkspaceId: {
            ...state.workflowDefinitionsByWorkspaceId,
            [workspaceId]: {
              definitions: state.workflowDefinitionsByWorkspaceId[workspaceId]?.definitions ?? [],
              error: errorMessage(error),
              loading: false,
            },
          },
        }));
      }
    },
    resetRuntimeState: () => {
      generation += 1;
      latestRefreshRequestIdsByWorkspaceId.clear();
      set({ selectedDefinitionIdsByWorkspaceId: {}, workflowDefinitionsByWorkspaceId: {} });
    },
    selectWorkflowDefinition: (workspaceId, definitionId) => {
      set((state) => ({
        selectedDefinitionIdsByWorkspaceId: {
          ...state.selectedDefinitionIdsByWorkspaceId,
          [workspaceId]: definitionId,
        },
      }));
    },
    selectedDefinitionIdsByWorkspaceId: {},
    workflowDefinitionsByWorkspaceId: {},
  };
});

function workflowDefinitionEventShouldRefreshDefinitions(event: WorkflowEvent) {
  return (
    event.type === "workflow_definition.created" ||
    event.type === "workflow_definition.updated" ||
    event.type === "workflow_definition.deleted"
  );
}

function workflowListLoadedPatch(
  state: WorkflowDefinitionStore,
  workspaceId: string,
  response: ListWorkflowDefinitionsResponse,
) {
  const selectedId = state.selectedDefinitionIdsByWorkspaceId[workspaceId];
  const selectedStillExists = response.definitions.some(
    (definition) => definition.id === selectedId,
  );
  const nextSelectedId = selectedStillExists ? selectedId : response.definitions[0]?.id;
  return {
    selectedDefinitionIdsByWorkspaceId: {
      ...state.selectedDefinitionIdsByWorkspaceId,
      [workspaceId]: nextSelectedId,
    },
    workflowDefinitionsByWorkspaceId: {
      ...state.workflowDefinitionsByWorkspaceId,
      [workspaceId]: {
        definitions: response.definitions,
        error: null,
        loading: false,
      },
    },
  } satisfies Partial<WorkflowDefinitionStore>;
}

function upsertDefinitionList(
  list: WorkflowDefinitionListState | undefined,
  definition: WorkflowDefinition,
) {
  const definitions = list?.definitions ?? [];
  return {
    definitions: [definition, ...definitions.filter((candidate) => candidate.id !== definition.id)]
      .slice()
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      ),
    error: null,
    loading: false,
  } satisfies WorkflowDefinitionListState;
}

function retainActiveKeys<Value>(
  record: Record<string, Value>,
  activeWorkspaceIds: ReadonlySet<string>,
) {
  const next: Record<string, Value> = {};
  for (const [workspaceId, value] of Object.entries(record)) {
    if (activeWorkspaceIds.has(workspaceId)) {
      next[workspaceId] = value;
    }
  }
  return next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workflow definition operation failed";
}
