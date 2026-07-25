import type { EnsureHostedAccessIntent, HostedAccessProgress } from "@generated/backend";

export const hostedAccessIpcChannels = {
  hostedAccessEnsure: "hosted-access:ensure",
  hostedAccessReleaseProgress: "hosted-access:release-progress",
  hostedAccessSubscribeProgress: "hosted-access:subscribe-progress",
} as const;

export interface HostedAccessProgressSubscriptionRequest {
  intentId: string;
  lastEventId: string;
}

export interface HostedAccessProgressReleaseRequest {
  intentId: string;
}

export interface HostedAccessIpcContract {
  hostedAccessEnsure: {
    args: [intent: EnsureHostedAccessIntent];
    result: HostedAccessProgress;
  };
  hostedAccessReleaseProgress: {
    args: [request: HostedAccessProgressReleaseRequest];
    result: void;
  };
  hostedAccessSubscribeProgress: {
    args: [request: HostedAccessProgressSubscriptionRequest];
    result: void;
  };
}
