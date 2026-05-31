import type { IpcMain, IpcMainInvokeEvent, IpcRenderer } from "electron";

import type {
  BackendHealth,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatMaintenanceResult,
  Conversation,
  GetActiveRunResponse,
  ListConversationsResponse,
  MessagePage,
  OpenWorkspaceResponse,
  QueueMessageResult,
  Run,
  RunActivityPage,
  RunItemOutputPage,
  SendMessageResult,
  SteerMessageResult,
  SubmitApprovalRequest,
  WorkspaceSession,
} from "@generated/backend";
import type { RuntimeVersions } from "./types";

export const ipcChannels = {
  appOpenExternalUrl: "app:open-external-url",
  appVersions: "app:versions",
  backendHealth: "backend:health",
  chatActiveRun: "chat:active-run",
  chatCancelRun: "chat:cancel-run",
  chatCreateConversation: "chat:create-conversation",
  chatClearQuarantine: "chat:clear-quarantine",
  chatExecuteCommand: "chat:execute-command",
  chatListConversations: "chat:list-conversations",
  chatListCommands: "chat:list-commands",
  chatMessagePage: "chat:message-page",
  chatQuarantineCorruptState: "chat:quarantine-corrupt-state",
  chatQueueMessage: "chat:queue-message",
  chatResetWorkspaceState: "chat:reset-workspace-state",
  chatRunActivity: "chat:run-activity",
  chatRunItemOutput: "chat:run-item-output",
  chatSendMessage: "chat:send-message",
  chatSteerMessage: "chat:steer-message",
  chatSubmitApproval: "chat:submit-approval",
  workspaceClose: "workspace:close",
  workspaceOpenLocalFolder: "workspace:open-local-folder",
  workspaceRemoveRecent: "workspace:remove-recent",
  workspaceReorder: "workspace:reorder",
  workspaceSelect: "workspace:select",
  workspaceSession: "workspace:session",
} as const;

export const ipcEvents = {
  backendEventStreamStatus: "backend:event-stream-status",
  backendProcessStatus: "backend:process-status",
  backendUnexpectedExit: "backend:unexpected-exit",
  chatEvent: "chat:event",
} as const;

interface IpcContract {
  appOpenExternalUrl: {
    args: [url: string];
    result: void;
  };
  appVersions: {
    args: [];
    result: RuntimeVersions;
  };
  backendHealth: {
    args: [];
    result: BackendHealth;
  };
  chatActiveRun: {
    args: [workspaceId: string, conversationId: string];
    result: GetActiveRunResponse;
  };
  chatCancelRun: {
    args: [workspaceId: string, conversationId: string];
    result: Run;
  };
  chatCreateConversation: {
    args: [workspaceId: string, title: string];
    result: Conversation;
  };
  chatClearQuarantine: {
    args: [workspaceId: string, confirmation: string];
    result: ChatMaintenanceResult;
  };
  chatExecuteCommand: {
    args: [workspaceId: string, conversationId: string, raw: string];
    result: ChatCommandExecuteResult;
  };
  chatListConversations: {
    args: [workspaceId: string];
    result: ListConversationsResponse;
  };
  chatListCommands: {
    args: [workspaceId: string, conversationId: string];
    result: ChatCommandListResult;
  };
  chatMessagePage: {
    args: [workspaceId: string, conversationId: string, beforeOrdinal: number, limit: number];
    result: MessagePage;
  };
  chatQuarantineCorruptState: {
    args: [workspaceId: string, confirmation: string];
    result: ChatMaintenanceResult;
  };
  chatQueueMessage: {
    args: [workspaceId: string, conversationId: string, prompt: string];
    result: QueueMessageResult;
  };
  chatResetWorkspaceState: {
    args: [workspaceId: string, confirmation: string];
    result: ChatMaintenanceResult;
  };
  chatRunActivity: {
    args: [workspaceId: string, runId: string, limit: number];
    result: RunActivityPage;
  };
  chatRunItemOutput: {
    args: [
      workspaceId: string,
      runId: string,
      runItemId: string,
      afterOrdinal: number,
      limit: number,
    ];
    result: RunItemOutputPage;
  };
  chatSendMessage: {
    args: [workspaceId: string, conversationId: string, prompt: string];
    result: SendMessageResult;
  };
  chatSteerMessage: {
    args: [workspaceId: string, conversationId: string, prompt: string];
    result: SteerMessageResult;
  };
  chatSubmitApproval: {
    args: [input: SubmitApprovalRequest];
    result: Run;
  };
  workspaceClose: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceOpenLocalFolder: {
    args: [];
    result: OpenWorkspaceResponse | null;
  };
  workspaceRemoveRecent: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceReorder: {
    args: [ids: string[]];
    result: WorkspaceSession;
  };
  workspaceSelect: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceSession: {
    args: [];
    result: WorkspaceSession;
  };
}

export type IpcChannelKey = keyof IpcContract;

export type RendererIpcInvoke = <Channel extends IpcChannelKey>(
  channel: Channel,
  ...args: IpcContract[Channel]["args"]
) => Promise<IpcContract[Channel]["result"]>;

export type MainIpcHandler<Channel extends IpcChannelKey> = (
  event: IpcMainInvokeEvent,
  ...args: IpcContract[Channel]["args"]
) => IpcContract[Channel]["result"] | Promise<IpcContract[Channel]["result"]>;

export interface IpcObserver {
  failed: (event: IpcObservedFailure) => void;
  finished: (event: IpcObservedFinish) => void;
  started: (event: IpcObservedStart) => void;
}

export interface IpcObservedStart {
  args: unknown[];
  channel: string;
  id: number;
}

export interface IpcObservedFinish {
  channel: string;
  durationMs: number;
  id: number;
  result: unknown;
}

export interface IpcObservedFailure {
  channel: string;
  durationMs: number;
  error: unknown;
  id: number;
}

let nextObservedIpcID = 1;

export function createRendererIpcInvoke(renderer: Pick<IpcRenderer, "invoke">): RendererIpcInvoke {
  return async (channel, ...args) => {
    const channelName = ipcChannels[channel];
    try {
      return (await renderer.invoke(channelName, ...args)) as IpcContract[typeof channel]["result"];
    } catch (error) {
      throw normalizeRendererIpcError(channelName, error);
    }
  };
}

function normalizeRendererIpcError(channelName: string, error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }
  const prefix = `Error invoking remote method '${channelName}': Error: `;
  if (!error.message.startsWith(prefix)) {
    return error;
  }
  return new Error(error.message.slice(prefix.length));
}

export function handleIpc<Channel extends IpcChannelKey>(
  main: Pick<IpcMain, "handle">,
  channel: Channel,
  handler: MainIpcHandler<Channel>,
  observer?: IpcObserver,
) {
  const channelName = ipcChannels[channel];
  main.handle(channelName, async (event, ...args) => {
    const id = nextObservedIpcID;
    nextObservedIpcID += 1;
    const startedAt = Date.now();
    observer?.started({ args, channel: channelName, id });
    try {
      const result = await handler(event, ...(args as IpcContract[Channel]["args"]));
      observer?.finished({
        channel: channelName,
        durationMs: Date.now() - startedAt,
        id,
        result,
      });
      return result;
    } catch (error) {
      observer?.failed({
        channel: channelName,
        durationMs: Date.now() - startedAt,
        error,
        id,
      });
      throw error;
    }
  });
}
