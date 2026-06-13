import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface WorkflowIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerWorkflowIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: WorkflowIpcRegistration): void {
  handleIpc(
    ipcMain,
    "workflowAddNode",
    async (_event, request) => {
      return requireBackendClient().addWorkflowNode(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowAddEdge",
    async (_event, request) => {
      return requireBackendClient().addWorkflowEdge(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowListDefinitions",
    async (_event, workspaceId) => {
      return requireBackendClient().listWorkflowDefinitions({ workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowCreateDefinition",
    async (_event, workspaceId, name, description, graph) => {
      return requireBackendClient().createWorkflowDefinition({
        description,
        graph,
        name,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowReadDefinition",
    async (_event, workspaceId, definitionId) => {
      return requireBackendClient().readWorkflowDefinition({ definitionId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowUpdateDefinition",
    async (_event, request) => {
      return requireBackendClient().updateWorkflowDefinition(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowDeleteNodes",
    async (_event, request) => {
      return requireBackendClient().deleteWorkflowNodes(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowDeleteDefinition",
    async (_event, workspaceId, definitionId) => {
      return requireBackendClient().deleteWorkflowDefinition({ definitionId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowValidateDefinition",
    async (_event, workspaceId, graph) => {
      return requireBackendClient().validateWorkflowDefinition({ graph, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowValidateDefinitionDraft",
    async (_event, request) => {
      return requireBackendClient().validateWorkflowDefinitionDraft(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowUpdateDefinitionLayout",
    async (_event, request) => {
      return requireBackendClient().updateWorkflowDefinitionLayout(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowUpdateDefinitionSettings",
    async (_event, request) => {
      return requireBackendClient().updateWorkflowDefinitionSettings(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowUpdateNode",
    async (_event, request) => {
      return requireBackendClient().updateWorkflowNode(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowUpdateEdge",
    async (_event, request) => {
      return requireBackendClient().updateWorkflowEdge(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowStartExecution",
    async (_event, workspaceId, definitionId, versionId) => {
      return requireBackendClient().startWorkflowExecution({
        definitionId,
        versionId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowCancelExecution",
    async (_event, workspaceId, executionId) => {
      return requireBackendClient().cancelWorkflowExecution({ executionId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowReadExecution",
    async (_event, workspaceId, executionId) => {
      return requireBackendClient().readWorkflowExecution({ executionId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowExecutionEvents",
    async (_event, workspaceId, executionId, beforeOrdinal, limit) => {
      return requireBackendClient().getWorkflowExecutionEvents({
        beforeOrdinal,
        executionId,
        limit,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowGraphProjection",
    async (_event, workspaceId, definitionId, versionId, executionId) => {
      return requireBackendClient().readWorkflowGraphProjection({
        definitionId,
        executionId,
        versionId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowSubmitApproval",
    async (_event, request) => {
      return requireBackendClient().submitWorkflowApproval(request);
    },
    ipcObserver,
  );
}
