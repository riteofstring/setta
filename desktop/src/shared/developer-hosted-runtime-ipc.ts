import type {
  DestroyDeveloperHostedRuntimeRequest,
  DeveloperHostedRuntimeStatus,
  EnsureDeveloperHostedRuntimeRequest,
} from "@generated/backend";

export const developerHostedRuntimeIpcChannels = {
  developerHostedRuntimeAvailable: "developer-hosted-runtime:available",
  developerHostedRuntimeDestroy: "developer-hosted-runtime:destroy",
  developerHostedRuntimeEnsure: "developer-hosted-runtime:ensure",
  developerHostedRuntimeStatus: "developer-hosted-runtime:status",
} as const;

export interface DeveloperHostedRuntimeIpcContract {
  developerHostedRuntimeAvailable: {
    args: [];
    result: boolean;
  };
  developerHostedRuntimeDestroy: {
    args: [request: DestroyDeveloperHostedRuntimeRequest];
    result: DeveloperHostedRuntimeStatus;
  };
  developerHostedRuntimeEnsure: {
    args: [request: EnsureDeveloperHostedRuntimeRequest];
    result: DeveloperHostedRuntimeStatus;
  };
  developerHostedRuntimeStatus: {
    args: [];
    result: DeveloperHostedRuntimeStatus | null;
  };
}
