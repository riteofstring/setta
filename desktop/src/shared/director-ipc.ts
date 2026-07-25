import type {
  DirectorEventCursor,
  DirectorIntent,
  DirectorReceipt,
  DirectorSnapshot,
} from "@generated/backend";

export const directorIpcChannels = {
  directorDispatchIntent: "director:dispatch-intent",
  directorReadSnapshot: "director:read-snapshot",
  directorSubscribeEvents: "director:subscribe-events",
} as const;

/**
 * The cursor a Director subscription continues from. It always comes from a
 * snapshot the shell already holds, because an app-scoped event has nothing to
 * apply to until the snapshot it follows exists.
 */
export interface DirectorEventSubscriptionRequest {
  cursor: DirectorEventCursor;
}

export interface DirectorIpcContract {
  directorDispatchIntent: {
    args: [intent: DirectorIntent];
    result: DirectorReceipt;
  };
  directorReadSnapshot: {
    args: [];
    result: DirectorSnapshot;
  };
  directorSubscribeEvents: {
    args: [request: DirectorEventSubscriptionRequest];
    result: void;
  };
}
