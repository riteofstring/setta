import { app, shell } from "electron";
import type { IpcMain } from "electron";

import { handleIpc, type IpcObserver } from "@shared/ipc";
import { readEditorIconDataURL } from "./editor-icon-data-url";
import { listInstalledEditorApps, openWorkspaceInEditor } from "./editor-apps";
import { readWorkspaceGitInfo } from "./workspace-actions";

interface AppIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  recordAppEvent?: (type: string, payload: Record<string, unknown>) => void;
}

export function registerAppIpcHandlers({
  ipcMain,
  ipcObserver,
  recordAppEvent,
}: AppIpcRegistration): void {
  handleIpc(
    ipcMain,
    "appInstalledEditors",
    () => {
      return listInstalledEditorApps(readEditorIconDataURL);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appOpenWorkspaceInEditor",
    async (_event, editorId, rootPath) => {
      await openWorkspaceInEditor(editorId, rootPath, {
        openPath: shell.openPath,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appWorkspaceGitInfo",
    async (_event, rootPath) => {
      return readWorkspaceGitInfo(rootPath);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appVersions",
    () => ({
      app: app.getVersion(),
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    }),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appOpenExternalUrl",
    async (_event, rawURL) => {
      await openExternalURL(rawURL, recordAppEvent);
    },
    ipcObserver,
  );
}

function externalURL(rawURL: string) {
  const url = new URL(rawURL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("external URL must use http or https: " + rawURL);
  }
  return url.toString();
}

async function openExternalURL(
  rawURL: string,
  recordAppEvent?: (type: string, payload: Record<string, unknown>) => void,
) {
  const url = externalURL(rawURL);
  if (process.env.SETTA_E2E_BLOCK_EXTERNAL_OPEN === "1") {
    recordAppEvent?.("external_url_open_blocked", { url });
    return;
  }
  await shell.openExternal(url);
}
