import type { IpcMain } from "electron";

import { handleIpc, type IpcObserver } from "@shared/ipc";
import { createElectronRuntimeSecretStore } from "./electron-runtime-secret-store";
import {
  listCloudRuntimeProvisionOptions,
  resolveCloudRuntimeProvision,
} from "./provision-resolver";
import { runApprovedCloudRuntimeProvision } from "./provision-executor";
import type { PendingProvisionStore } from "./pending-provision-store";
import type { RuntimeRegistryController } from "./runtime-registry";
import { runSettaRemoteAddSSH } from "./runtime-ssh";
import { TailscaleOAuthService } from "./tailscale-oauth";

interface RuntimeIpcRegistration {
  appDataDir: string;
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  repoRoot: string;
  requirePendingProvisionStore: () => PendingProvisionStore;
  requireRuntimeRegistry: () => RuntimeRegistryController;
  tailscaleOAuthService?: TailscaleOAuthService;
}

export function registerRuntimeIpcHandlers({
  appDataDir,
  ipcMain,
  ipcObserver,
  repoRoot,
  requirePendingProvisionStore,
  requireRuntimeRegistry,
  tailscaleOAuthService,
}: RuntimeIpcRegistration): void {
  const tailscaleOAuth =
    tailscaleOAuthService ??
    new TailscaleOAuthService({
      secretStore: createElectronRuntimeSecretStore(appDataDir),
      userDataDir: appDataDir,
    });
  handleIpc(
    ipcMain,
    "runtimeCurrent",
    async () => {
      return requireRuntimeRegistry().snapshot();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeList",
    async () => {
      return requireRuntimeRegistry().list();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeAddByPairingUrl",
    async (_event, pairingUrl) => {
      return requireRuntimeRegistry().addByPairingURL(pairingUrl);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeAddExistingMachineOverSSH",
    async (_event, request) => {
      const result = await runSettaRemoteAddSSH(request, {
        appDataDir,
        env: process.env,
        repoRoot,
      });
      return requireRuntimeRegistry().addByPairingURL(result.pairingUrl);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeCloudProvisionOptions",
    async () => {
      return listCloudRuntimeProvisionOptions({
        env: process.env,
        repoRoot,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeCloudProvisionResolve",
    async (_event, request) => {
      return resolveCloudRuntimeProvision(request, {
        env: process.env,
        repoRoot,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeCloudProvisionExecute",
    async (_event, request) => {
      return runApprovedCloudRuntimeProvision(request, {
        appDataDir,
        env: process.env,
        pendingProvisionStore: requirePendingProvisionStore(),
        repoRoot,
        runtimeRegistry: requireRuntimeRegistry(),
        tailscaleOAuthService: tailscaleOAuth,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeCreateDevicePairing",
    async () => {
      return requireRuntimeRegistry().createDevicePairing();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeSwitch",
    async (_event, runtimeId) => {
      return requireRuntimeRegistry().switchToRuntime(runtimeId);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeRemove",
    async (_event, runtimeId) => {
      return requireRuntimeRegistry().removeRuntime(runtimeId);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeTailscaleOAuthSetupGuide",
    async () => {
      return tailscaleOAuth.setupGuide();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeTailscaleOAuthSaveCredentials",
    async (_event, request) => {
      return tailscaleOAuth.saveCredentials(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeTailscaleOAuthValidate",
    async () => {
      return tailscaleOAuth.validateCredentials();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeTailscaleAuthKeyMint",
    async (_event, request) => {
      return tailscaleOAuth.mintAuthKey(request);
    },
    ipcObserver,
  );
}
