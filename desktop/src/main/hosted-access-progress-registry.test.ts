import type { HostedAccessProgress } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { HostedAccessProgressRegistry } from "./hosted-access-progress-registry";

describe("hosted access progress registry", () => {
  test("forwards ordered progress and aborts a released renderer stream", async () => {
    const progress = readyProgress();
    const streamProgress = vi.fn(async function* (
      socketPath: string,
      intentId: string,
      lastEventId = "",
      signal?: AbortSignal,
    ) {
      expect(socketPath).toBe("/tmp/setta-hosted.sock");
      expect(intentId).toBe("intent-hosted");
      expect(lastEventId).toBe("2");
      expect(signal).toBeDefined();
      yield progress;
      if (signal?.aborted) {
        return;
      }
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve()));
    });
    const registry = new HostedAccessProgressRegistry({
      socketPath: () => "/tmp/setta-hosted.sock",
      streamProgress,
    });
    let destroyed: (() => void) | undefined;
    const sender = {
      id: 9,
      isDestroyed: () => false,
      once: vi.fn((_event: "destroyed", listener: () => void) => {
        destroyed = listener;
      }),
      send: vi.fn(),
    };

    registry.subscribe(sender, { intentId: "intent-hosted", lastEventId: "2" });
    await vi.waitFor(() => {
      expect(sender.send).toHaveBeenCalledWith(ipcEvents.hostedAccessProgress, progress);
    });
    registry.release(sender, "intent-hosted");
    expect(streamProgress.mock.calls[0]?.[3]?.aborted).toBe(true);

    registry.subscribe(sender, { intentId: "intent-hosted", lastEventId: "2" });
    destroyed?.();
    expect(streamProgress.mock.calls[1]?.[3]?.aborted).toBe(true);
  });

  test("reports stream failures without reporting intentional cancellation", async () => {
    const failure = new Error("progress stream failed");
    const reportDisconnect = vi.fn();
    const registry = new HostedAccessProgressRegistry({
      reportDisconnect,
      socketPath: () => "/tmp/setta-hosted.sock",
      streamProgress: async function* (_socketPath, intentId) {
        if (intentId === "intent-failure") {
          throw failure;
        }
        yield readyProgress();
      },
    });
    const sender = {
      id: 10,
      isDestroyed: () => false,
      once: vi.fn(),
      send: vi.fn(),
    };

    registry.subscribe(sender, { intentId: "intent-failure", lastEventId: "" });
    await vi.waitFor(() => {
      expect(reportDisconnect).toHaveBeenCalledWith(failure);
    });
  });
});

function readyProgress(): HostedAccessProgress {
  return {
    accessGrant: {
      deviceId: "device-hosted",
      expiresAt: "2026-07-24T16:00:00Z",
      grantedCapabilities: ["observe", "steer"],
      projectId: "project-hosted",
      workstreamId: "workstream-hosted",
    },
    cursor: "3",
    intentId: "intent-hosted",
    occurredAt: "2026-07-24T15:00:00Z",
    reasonCode: "",
    retryable: false,
    state: "ready_on_phone",
  };
}
