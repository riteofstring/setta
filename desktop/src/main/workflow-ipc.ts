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
    "workflowListDefinitions",
    async (_event, workspaceId) => {
      return requireBackendClient().listWorkflowDefinitions({ workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowListExecutions",
    async (_event, workspaceId, definitionId, limit) => {
      return requireBackendClient().listWorkflowExecutions({
        definitionId,
        limit,
        workspaceId,
      });
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
    async (_event, ...args) => {
      const [workspaceId, definitionId, name, description, graph] = args;
      return requireBackendClient().updateWorkflowDefinition({
        definitionId,
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
