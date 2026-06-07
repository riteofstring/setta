import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

export function registerSemanticGraphIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: {
  ipcMain: IpcMain;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}) {
  handleIpc(
    ipcMain,
    "semanticGraphRead",
    async (_event, request) => {
      return requireBackendClient().readSemanticGraph(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphNodeDetail",
    async (_event, request) => {
      return requireBackendClient().readSemanticNodeDetail(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphEvidenceList",
    async (_event, request) => {
      return requireBackendClient().listSemanticEvidence(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphActivityList",
    async (_event, request) => {
      return requireBackendClient().listSemanticActivity(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphActivityPage",
    async (_event, request) => {
      return requireBackendClient().listSemanticActivityPage(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphActivitySummary",
    async (_event, request) => {
      return requireBackendClient().readSemanticActivitySummary(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphSteeringRead",
    async (_event, request) => {
      return requireBackendClient().readSemanticSteeringState(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphEventHistory",
    async (_event, request) => {
      return requireBackendClient().readSemanticEventHistory(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphLayoutUpdate",
    async (_event, request) => {
      return requireBackendClient().updateSemanticLayoutPositions(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphAttachWorkflowExecution",
    async (_event, request) => {
      return requireBackendClient().attachSemanticNodeToWorkflowExecution(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphAttachWorkflowNode",
    async (_event, request) => {
      return requireBackendClient().attachSemanticNodeToWorkflowNode(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphAttachChatRun",
    async (_event, request) => {
      return requireBackendClient().attachSemanticNodeToChatRun(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphAttachChatMessage",
    async (_event, request) => {
      return requireBackendClient().attachSemanticNodeToChatMessage(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphAttachRunItem",
    async (_event, request) => {
      return requireBackendClient().attachSemanticNodeToRunItem(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphAttachFileRange",
    async (_event, request) => {
      return requireBackendClient().attachSemanticNodeToFileRange(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphActivityEnd",
    async (_event, request) => {
      return requireBackendClient().endSemanticActivity(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphRenameNode",
    async (_event, request) => {
      return requireBackendClient().renameSemanticNode(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphUpdateNode",
    async (_event, request) => {
      return requireBackendClient().updateSemanticNode(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphDismissNode",
    async (_event, request) => {
      return requireBackendClient().dismissSemanticNode(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphPromoteNode",
    async (_event, request) => {
      return requireBackendClient().promoteSemanticNode(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphSplitNode",
    async (_event, request) => {
      return requireBackendClient().splitSemanticNode(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphMergeNodes",
    async (_event, request) => {
      return requireBackendClient().mergeSemanticNodes(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphCreateNode",
    async (_event, request) => {
      return requireBackendClient().createSemanticNode(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphCreateEdge",
    async (_event, request) => {
      return requireBackendClient().createSemanticEdge(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphUpdateEdge",
    async (_event, request) => {
      return requireBackendClient().updateSemanticEdge(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphRemoveEdge",
    async (_event, request) => {
      return requireBackendClient().removeSemanticEdge(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphCreateSteeringDirective",
    async (_event, request) => {
      return requireBackendClient().createSemanticSteeringDirective(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "semanticGraphUpdateSteeringDirective",
    async (_event, request) => {
      return requireBackendClient().updateSemanticSteeringDirective(request);
    },
    ipcObserver,
  );
}
