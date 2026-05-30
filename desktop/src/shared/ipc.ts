import type { IpcMain, IpcMainInvokeEvent, IpcRenderer } from "electron";

import type { BackendHealth, OpenWorkspaceResponse, WorkspaceSession } from "@generated/backend";
import type {
  BrowserPaneBounds,
  BrowserPaneEvents,
  BrowserPanePoint,
  BrowserPaneScreenshot,
  BrowserPaneSnapshot,
  BrowserPaneStatus,
  RuntimeVersions,
} from "./types";

export const ipcChannels = {
  appVersions: "app:versions",
  backendHealth: "backend:health",
  browserPaneCaptureScreenshot: "browser-pane:capture-screenshot",
  browserPaneClick: "browser-pane:click",
  browserPaneEvents: "browser-pane:events",
  browserPaneFocus: "browser-pane:focus",
  browserPaneInspect: "browser-pane:inspect",
  browserPaneLoadPreview: "browser-pane:load-preview",
  browserPaneSetBounds: "browser-pane:set-bounds",
  browserPaneStatus: "browser-pane:status",
  browserPaneTypeText: "browser-pane:type-text",
  workspaceClose: "workspace:close",
  workspaceOpenLocalFolder: "workspace:open-local-folder",
  workspaceRemoveRecent: "workspace:remove-recent",
  workspaceReorder: "workspace:reorder",
  workspaceSelect: "workspace:select",
  workspaceSession: "workspace:session",
} as const;

export const ipcEvents = {
  backendUnexpectedExit: "backend:unexpected-exit",
} as const;

interface IpcContract {
  appVersions: {
    args: [];
    result: RuntimeVersions;
  };
  backendHealth: {
    args: [];
    result: BackendHealth;
  };
  browserPaneCaptureScreenshot: {
    args: [];
    result: BrowserPaneScreenshot;
  };
  browserPaneClick: {
    args: [point: BrowserPanePoint];
    result: void;
  };
  browserPaneEvents: {
    args: [];
    result: BrowserPaneEvents;
  };
  browserPaneFocus: {
    args: [];
    result: void;
  };
  browserPaneInspect: {
    args: [selector: string];
    result: BrowserPaneSnapshot | null;
  };
  browserPaneLoadPreview: {
    args: [];
    result: BrowserPaneStatus;
  };
  browserPaneSetBounds: {
    args: [bounds: BrowserPaneBounds];
    result: BrowserPaneStatus;
  };
  browserPaneStatus: {
    args: [];
    result: BrowserPaneStatus;
  };
  browserPaneTypeText: {
    args: [text: string];
    result: void;
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

export function createRendererIpcInvoke(renderer: Pick<IpcRenderer, "invoke">): RendererIpcInvoke {
  return (channel, ...args) =>
    renderer.invoke(ipcChannels[channel], ...args) as Promise<
      IpcContract[typeof channel]["result"]
    >;
}

export function handleIpc<Channel extends IpcChannelKey>(
  main: Pick<IpcMain, "handle">,
  channel: Channel,
  handler: MainIpcHandler<Channel>,
) {
  main.handle(ipcChannels[channel], (event, ...args) =>
    handler(event, ...(args as IpcContract[Channel]["args"])),
  );
}
