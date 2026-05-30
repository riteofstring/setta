import { contextBridge, ipcRenderer } from "electron";

import { createRendererIpcInvoke } from "@shared/ipc";
import type { SettaAPI } from "@shared/types";
import { installRendererRecorder } from "./renderer-recorder";

const invoke = createRendererIpcInvoke(ipcRenderer);

const api: SettaAPI = {
  app: {
    versions: () => invoke("appVersions"),
  },
  backend: {
    health: () => invoke("backendHealth"),
  },
  chat: {
    activeRun: (workspaceId: string, conversationId: string) =>
      invoke("chatActiveRun", workspaceId, conversationId),
    cancelRun: (workspaceId: string, conversationId: string) =>
      invoke("chatCancelRun", workspaceId, conversationId),
    createConversation: (workspaceId: string, title: string) =>
      invoke("chatCreateConversation", workspaceId, title),
    listConversations: (workspaceId: string) => invoke("chatListConversations", workspaceId),
    messagePage: (
      workspaceId: string,
      conversationId: string,
      beforeOrdinal: number,
      limit: number,
    ) => invoke("chatMessagePage", workspaceId, conversationId, beforeOrdinal, limit),
    sendMessage: (workspaceId: string, conversationId: string, prompt: string) =>
      invoke("chatSendMessage", workspaceId, conversationId, prompt),
    submitApproval: (input) => invoke("chatSubmitApproval", input),
  },
  workspace: {
    close: (id: string) => invoke("workspaceClose", id),
    openLocalFolder: () => invoke("workspaceOpenLocalFolder"),
    removeRecent: (id: string) => invoke("workspaceRemoveRecent", id),
    reorder: (ids: string[]) => invoke("workspaceReorder", ids),
    select: (id: string) => invoke("workspaceSelect", id),
    session: () => invoke("workspaceSession"),
  },
};

installRendererRecorder(ipcRenderer);
contextBridge.exposeInMainWorld("setta", api);
