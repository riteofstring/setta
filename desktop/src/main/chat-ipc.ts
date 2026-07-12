import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";
import { selectChatImageAttachmentPaths } from "./chat-image-attachment-picker";

interface ChatIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerChatIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: ChatIpcRegistration): void {
  handleIpc(
    ipcMain,
    "chatListConversations",
    async (_event, workspaceId) => {
      return requireBackendClient().listConversations({ workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatCreateConversation",
    async (_event, workspaceId, title) => {
      return requireBackendClient().createConversation({ title, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatDeleteConversation",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().deleteConversation({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatMarkConversationRead",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().markConversationRead({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSetConversationPinned",
    async (_event, workspaceId, conversationId, pinned) => {
      return requireBackendClient().setConversationPinned({ conversationId, pinned, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatMessagePage",
    async (_event, workspaceId, conversationId, beforeBlockOrdinal, limit) => {
      return requireBackendClient().getMessagePage({
        beforeBlockOrdinal,
        conversationId,
        limit,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatListComposerPromptHistory",
    async (_event, workspaceId, conversationId, beforeOrdinal, limit) => {
      return requireBackendClient().listComposerPromptHistory({
        beforeOrdinal,
        conversationId,
        limit,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatListCommands",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().listChatCommands({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatExecuteCommand",
    async (_event, workspaceId, conversationId, raw, confirmGoalReplacement) => {
      return requireBackendClient().executeChatCommand({
        confirmGoalReplacement,
        conversationId,
        raw,
        workspaceId,
      });
    },
    ipcObserver,
  );
  registerChatRunIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  registerChatAttachmentIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  registerChatActivityIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  registerChatBackgroundTerminalIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
}

function registerChatRunIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: ChatIpcRegistration): void {
  handleIpc(
    ipcMain,
    "chatSendMessage",
    async (_event, workspaceId, conversationId, input) => {
      return requireBackendClient().sendChatMessage({ conversationId, input, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatQueueMessage",
    async (_event, workspaceId, conversationId, input) => {
      return requireBackendClient().queueChatMessage({ conversationId, input, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatEditQueuedMessage",
    async (_event, workspaceId, conversationId, messageId, input) => {
      return requireBackendClient().editQueuedChatMessage({
        conversationId,
        input,
        messageId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatRemoveQueuedMessage",
    async (_event, workspaceId, conversationId, messageId) => {
      return requireBackendClient().removeQueuedChatMessage({
        conversationId,
        messageId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSteerMessage",
    async (_event, workspaceId, conversationId, input) => {
      return requireBackendClient().steerChatMessage({ conversationId, input, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSendSteeringImmediately",
    async (_event, workspaceId, conversationId, input) => {
      return requireBackendClient().sendSteeringImmediately({
        conversationId,
        input,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatCancelRun",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().cancelRun({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatActiveRun",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().getActiveRun({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatReconcileRuns",
    async (_event, request) => {
      return requireBackendClient().reconcileChatRuns(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSubmitApproval",
    async (_event, input) => {
      return requireBackendClient().submitApproval(input);
    },
    ipcObserver,
  );
}

function registerChatAttachmentIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: ChatIpcRegistration): void {
  handleIpc(
    ipcMain,
    "chatCreateImageAttachmentFromBytes",
    async (_event, workspaceId, conversationId, fileName, dataBase64) => {
      return requireBackendClient().createChatImageAttachmentFromBytes({
        conversationId,
        dataBase64,
        fileName,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSelectImageAttachments",
    async (_event, workspaceId, conversationId, maxCount) => {
      if (!Number.isInteger(maxCount) || maxCount <= 0) {
        throw new Error("No image attachment slots remaining.");
      }
      const selectedPaths = await selectChatImageAttachmentPaths();
      if (selectedPaths === null) {
        return [];
      }
      if (selectedPaths.length > maxCount) {
        throw new Error(`Select at most ${maxCount} images.`);
      }
      const client = requireBackendClient();
      const attachments = [];
      for (const path of selectedPaths) {
        attachments.push(
          await client.createChatImageAttachmentFromPath({
            conversationId,
            sourcePath: path,
            workspaceId,
          }),
        );
      }
      return attachments;
    },
    ipcObserver,
  );
}

function registerChatActivityIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: ChatIpcRegistration): void {
  handleIpc(
    ipcMain,
    "chatRunActivity",
    async (_event, workspaceId, runId, afterItemId, limit) => {
      return requireBackendClient().getRunActivity({ afterItemId, limit, runId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatRunItemOutput",
    async (_event, ...args) => {
      const [workspaceId, runId, runItemId, afterOrdinal, limit] = args;
      return requireBackendClient().getRunItemOutputPage({
        afterOrdinal,
        limit,
        runId,
        runItemId,
        workspaceId,
      });
    },
    ipcObserver,
  );
}

function registerChatBackgroundTerminalIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: ChatIpcRegistration): void {
  handleIpc(
    ipcMain,
    "chatListBackgroundTerminals",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().listBackgroundTerminals({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatGetBackgroundTerminalOutput",
    async (_event, ...args) => {
      const [workspaceId, conversationId, processId, afterOrdinal, limit] = args;
      return requireBackendClient().getBackgroundTerminalOutput({
        afterOrdinal,
        conversationId,
        limit,
        processId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatKillBackgroundTerminal",
    async (_event, workspaceId, conversationId, processId) => {
      return requireBackendClient().killBackgroundTerminal({
        conversationId,
        processId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatKillAllBackgroundTerminals",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().killAllBackgroundTerminals({ conversationId, workspaceId });
    },
    ipcObserver,
  );
}
