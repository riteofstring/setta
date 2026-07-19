import type { IpcMain, IpcMainInvokeEvent, IpcRenderer } from "electron";
import type {
  AppearancePresetList,
  AppearanceSettings,
  BackendHealth,
  CancelCodexLoginRequest,
  CodexAccountState,
  LogoutCodexAccountRequest,
  OpenWorkspaceResponse,
  RefreshCodexAccountRequest,
  StartCodexLoginRequest,
  StartCodexLoginResponse,
  UpdateAppearanceSettingsRequest,
  WorkspaceUILayout,
  WorkspaceUILayoutReadResult,
  WorkspaceSession,
} from "@generated/backend";
import { conversationIpcChannels, type ConversationIpc } from "./conversation-ipc";
import { masterIpcChannels, type MasterIpcContract } from "./master-ipc";
import {
  roleConfigurationIpcChannels,
  type RoleConfigurationIpcContract,
} from "./role-configuration-ipc";
import { speechIpcChannels, type SpeechIpcContract } from "./speech-ipc";
import type {
  AppWindowDragPoint,
  InstalledEditorApp,
  KnownRuntimeView,
  RendererRegionCaptureRequest,
  RendererRegionSnapshot,
  RuntimeRegistrySnapshot,
  RuntimeVersions,
  WorkspaceBrowserViewStats,
  WorkspaceGitInfo,
} from "./types";

export const ipcChannels = {
  appInstalledEditors: "app:installed-editors",
  appCaptureRendererRegion: "app:capture-renderer-region",
  appWindowDragEnd: "app:window-drag-end",
  appWindowDragMove: "app:window-drag-move",
  appWindowDragStart: "app:window-drag-start",
  appOpenExternalUrl: "app:open-external-url",
  appOpenWorkspaceInEditor: "app:open-workspace-in-editor",
  appVersions: "app:versions",
  appWorkspaceGitInfo: "app:workspace-git-info",
  appearancePresets: "appearance:presets",
  appearanceRead: "appearance:read",
  appearanceUpdate: "appearance:update",
  backendHealth: "backend:health",
  runtimeAddByPairingUrl: "runtimes:add-by-pairing-url",
  runtimeCurrent: "runtimes:current",
  runtimeList: "runtimes:list",
  runtimeRemove: "runtimes:remove",
  runtimeSwitch: "runtimes:switch",
  ...conversationIpcChannels,
  ...masterIpcChannels,
  ...roleConfigurationIpcChannels,
  ...speechIpcChannels,
  codexAccountCancelLogin: "codex-account:cancel-login",
  codexAccountLogout: "codex-account:logout",
  codexAccountRead: "codex-account:read",
  codexAccountRefresh: "codex-account:refresh",
  codexAccountStartLogin: "codex-account:start-login",
  workspaceBrowserViewStats: "workspace:browser-view-stats",
  workspaceBrowserViewsTeardown: "workspace:browser-views-teardown",
  workspaceClose: "workspace:close",
  workspaceOpenLocalFolder: "workspace:open-local-folder",
  workspaceOpenPath: "workspace:open-path",
  workspaceRelocateLocalFolder: "workspace:relocate-local-folder",
  workspaceReadUILayout: "workspace:read-ui-layout",
  workspaceRefreshAvailability: "workspace:refresh-availability",
  workspaceRemoveRecent: "workspace:remove-recent",
  workspaceReorder: "workspace:reorder",
  workspaceSaveUILayout: "workspace:save-ui-layout",
  workspaceSelect: "workspace:select",
  workspaceSession: "workspace:session",
} as const;

export const ipcMessages = {
  workspaceBrowserViewBatch: "workspace:browser-view-batch",
} as const;

export const ipcEvents = {
  backendProcessStatus: "backend:process-status",
  backendUnexpectedExit: "backend:unexpected-exit",
  codexAccountChange: "codex-account:change",
  conversationEvent: "conversation:event",
  runtimeConnectionState: "runtimes:connection-state",
  speechCredentialSettingsChanged: "speech:credential-settings-changed",
  speechProviderSelectionChanged: "speech:provider-selection-changed",
  workspaceBrowserViewKey: "workspace:browser-view-key",
  workspaceBrowserViewSnapshot: "workspace:browser-view-snapshot",
} as const;

interface IpcContract
  extends ConversationIpc, MasterIpcContract, RoleConfigurationIpcContract, SpeechIpcContract {
  appInstalledEditors: {
    args: [];
    result: InstalledEditorApp[];
  };
  appCaptureRendererRegion: {
    args: [request: RendererRegionCaptureRequest];
    result: RendererRegionSnapshot;
  };
  appWindowDragEnd: {
    args: [];
    result: void;
  };
  appWindowDragMove: {
    args: [point: AppWindowDragPoint];
    result: void;
  };
  appWindowDragStart: {
    args: [point: AppWindowDragPoint];
    result: void;
  };
  appOpenExternalUrl: {
    args: [url: string];
    result: void;
  };
  appOpenWorkspaceInEditor: {
    args: [editorId: string, rootPath: string];
    result: void;
  };
  appVersions: {
    args: [];
    result: RuntimeVersions;
  };
  appWorkspaceGitInfo: {
    args: [rootPath: string];
    result: WorkspaceGitInfo;
  };
  appearanceRead: {
    args: [];
    result: AppearanceSettings;
  };
  appearancePresets: {
    args: [];
    result: AppearancePresetList;
  };
  appearanceUpdate: {
    args: [request: UpdateAppearanceSettingsRequest];
    result: AppearanceSettings;
  };
  backendHealth: {
    args: [];
    result: BackendHealth;
  };
  runtimeAddByPairingUrl: {
    args: [pairingUrl: string];
    result: RuntimeRegistrySnapshot;
  };
  runtimeCurrent: {
    args: [];
    result: RuntimeRegistrySnapshot;
  };
  runtimeList: {
    args: [];
    result: KnownRuntimeView[];
  };
  runtimeRemove: {
    args: [runtimeId: string];
    result: RuntimeRegistrySnapshot;
  };
  runtimeSwitch: {
    args: [runtimeId: string];
    result: RuntimeRegistrySnapshot;
  };
  codexAccountCancelLogin: {
    args: [request: CancelCodexLoginRequest];
    result: CodexAccountState;
  };
  codexAccountLogout: {
    args: [request: LogoutCodexAccountRequest];
    result: CodexAccountState;
  };
  codexAccountRead: {
    args: [];
    result: CodexAccountState;
  };
  codexAccountRefresh: {
    args: [request: RefreshCodexAccountRequest];
    result: CodexAccountState;
  };
  codexAccountStartLogin: {
    args: [request: StartCodexLoginRequest];
    result: StartCodexLoginResponse;
  };
  workspaceBrowserViewStats: {
    args: [];
    result: WorkspaceBrowserViewStats;
  };
  workspaceBrowserViewsTeardown: {
    args: [workspaceId: string];
    result: WorkspaceBrowserViewStats;
  };
  workspaceClose: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceOpenLocalFolder: {
    args: [];
    result: OpenWorkspaceResponse | null;
  };
  workspaceOpenPath: {
    args: [rootPath: string];
    result: OpenWorkspaceResponse;
  };
  workspaceRelocateLocalFolder: {
    args: [id: string];
    result: OpenWorkspaceResponse | null;
  };
  workspaceReadUILayout: {
    args: [workspaceId: string];
    result: WorkspaceUILayoutReadResult;
  };
  workspaceRefreshAvailability: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceRemoveRecent: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceReorder: {
    args: [ids: string[]];
    result: WorkspaceSession;
  };
  workspaceSaveUILayout: {
    args: [layout: WorkspaceUILayout];
    result: WorkspaceUILayout;
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
