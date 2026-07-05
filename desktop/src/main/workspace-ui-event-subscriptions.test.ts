import { describe, expect, test, vi } from "vitest";

import { createWorkspaceUIEventSubscriptionRegistry } from "./workspace-ui-event-subscriptions";

describe("workspace UI event subscriptions", () => {
  test("shares a workspace stream across subscribers and restarts active subscriptions", async () => {
    const stopped: string[] = [];
    const starts: string[] = [];
    const registry = createWorkspaceUIEventSubscriptionRegistry({
      startStream: (workspaceId) => {
        starts.push(workspaceId);
        return {
          stop: async () => {
            stopped.push(workspaceId);
          },
        };
      },
    });

    registry.subscribe("workspace_api", fakeSubscriber(1));
    registry.subscribe("workspace_api", fakeSubscriber(2));

    expect(starts).toEqual(["workspace_api"]);

    await registry.stopStreams();
    registry.startStreams();

    expect(stopped).toEqual(["workspace_api"]);
    expect(starts).toEqual(["workspace_api", "workspace_api"]);
  });

  test("cleans subscriptions owned by destroyed senders", async () => {
    const stopped: string[] = [];
    const sender = fakeSubscriber(1);
    const otherSender = fakeSubscriber(2);
    const registry = createWorkspaceUIEventSubscriptionRegistry({
      startStream: (workspaceId) => ({
        stop: async () => {
          stopped.push(workspaceId);
        },
      }),
    });

    registry.subscribe("workspace_api", sender);
    registry.subscribe("workspace_api", sender);
    registry.subscribe("workspace_api", otherSender);

    sender.destroy();

    expect(stopped).toEqual([]);

    registry.unsubscribe("workspace_api", otherSender);

    expect(stopped).toEqual(["workspace_api"]);
  });

  test("does not let an unmatched sender unsubscribe another sender's subscription", () => {
    const stopped: string[] = [];
    const registry = createWorkspaceUIEventSubscriptionRegistry({
      startStream: (workspaceId) => ({
        stop: async () => {
          stopped.push(workspaceId);
        },
      }),
    });

    registry.subscribe("workspace_api", fakeSubscriber(1));
    registry.unsubscribe("workspace_api", fakeSubscriber(2));

    expect(stopped).toEqual([]);
  });

  test("rejects missing workspace IDs", () => {
    const registry = createWorkspaceUIEventSubscriptionRegistry({
      startStream: () => null,
    });

    expect(() => registry.subscribe("", fakeSubscriber(1))).toThrow(
      "workspace UI event subscription requires workspaceId",
    );
  });
});

function fakeSubscriber(id: number) {
  const destroyedListeners: Array<() => void> = [];
  return {
    destroy: () => {
      for (const listener of destroyedListeners) {
        listener();
      }
    },
    id,
    once: vi.fn((event: "destroyed", listener: () => void) => {
      if (event === "destroyed") {
        destroyedListeners.push(listener);
      }
    }),
  };
}
