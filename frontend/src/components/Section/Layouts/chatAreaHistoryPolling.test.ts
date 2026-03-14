import { describe, expect, it } from "vitest";
import { resolveManagedChatHistoryPollIntervalMs } from "./ChatArea";

describe("resolveManagedChatHistoryPollIntervalMs", () => {
  it("polls while a section chat run is active", () => {
    // Active runs should keep the history pane responsive.
    expect(
      resolveManagedChatHistoryPollIntervalMs({
        hasLoadError: false,
        hasRunningHistoryEntry: true,
      }),
    ).toBe(5000);
  });

  it("retries load failures even when no run is active", () => {
    // Load failures need periodic retries so transient errors self-heal.
    expect(
      resolveManagedChatHistoryPollIntervalMs({
        hasLoadError: true,
        hasRunningHistoryEntry: false,
      }),
    ).toBe(10000);
  });

  it("stops polling when idle and healthy", () => {
    // Idle history should avoid unnecessary background polling.
    expect(
      resolveManagedChatHistoryPollIntervalMs({
        hasLoadError: false,
        hasRunningHistoryEntry: false,
      }),
    ).toBeNull();
  });
});
