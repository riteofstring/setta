import type { CreateDevicePairingResponse } from "@generated/backend";

import type {
  AddExistingMachineSSHRuntimeRequest,
  CloudRuntimeProvisionOptions,
  CloudRuntimeProvisionExecuteRequest,
  CloudRuntimeProvisionExecuteResult,
  CloudRuntimeProvisionResolveRequest,
  CloudRuntimeProvisionResolveResult,
  KnownRuntimeView,
  MintTailscaleAuthKeyRequest,
  MintTailscaleAuthKeyResult,
  RuntimeRegistrySnapshot,
  SaveTailscaleOAuthCredentialsRequest,
  TailscaleOAuthCredentialStatus,
  TailscaleOAuthSetupGuide,
  TailscaleOAuthValidationResult,
} from "./types";

export interface RuntimeIpcContract {
  runtimeAddByPairingUrl: { args: [pairingUrl: string]; result: RuntimeRegistrySnapshot };
  runtimeAddExistingMachineOverSSH: {
    args: [request: AddExistingMachineSSHRuntimeRequest];
    result: RuntimeRegistrySnapshot;
  };
  runtimeCloudProvisionOptions: { args: []; result: CloudRuntimeProvisionOptions };
  runtimeCloudProvisionResolve: {
    args: [request: CloudRuntimeProvisionResolveRequest];
    result: CloudRuntimeProvisionResolveResult;
  };
  runtimeCloudProvisionExecute: {
    args: [request: CloudRuntimeProvisionExecuteRequest];
    result: CloudRuntimeProvisionExecuteResult;
  };
  runtimeCreateDevicePairing: { args: []; result: CreateDevicePairingResponse };
  runtimeCurrent: { args: []; result: RuntimeRegistrySnapshot };
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
  runtimeTailscaleAuthKeyMint: {
    args: [request: MintTailscaleAuthKeyRequest];
    result: MintTailscaleAuthKeyResult;
  };
  runtimeTailscaleOAuthSaveCredentials: {
    args: [request: SaveTailscaleOAuthCredentialsRequest];
    result: TailscaleOAuthCredentialStatus;
  };
  runtimeTailscaleOAuthSetupGuide: { args: []; result: TailscaleOAuthSetupGuide };
  runtimeTailscaleOAuthValidate: { args: []; result: TailscaleOAuthValidationResult };
}
