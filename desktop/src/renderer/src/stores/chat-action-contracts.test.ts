import { beforeEach, describe, expect, test, vi } from "vitest";

import { runChatBackgroundAction } from "./chat-background-actions";
import { startStoreBackedChatInteractiveAction } from "./chat-interactive-actions";
import { useChatStore } from "./chat-store";

describe("chat async action contracts", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  test("reports background chat action failures through the explicit background boundary", async () => {
    const error = new Error("workspace sync failed");
    const reportFailure = vi.fn();

    runChatBackgroundAction(
      "workspace-chat-sync",
      async () => {
        throw error;
      },
      reportFailure,
    );
    await flushAsyncAction();

    expect(reportFailure).toHaveBeenCalledWith({
      error,
      name: "workspace-chat-sync",
    });
  });

  test("does not report store-backed interactive failures that already have visible chat error state", async () => {
    const reportFailure = vi.fn();
    useChatStore.setState({ error: "nothing to replay" });

    startStoreBackedChatInteractiveAction(
      "send-pending-steering",
      async () => {
        throw new Error("nothing to replay");
      },
      reportFailure,
    );
    await flushAsyncAction();

    expect(reportFailure).not.toHaveBeenCalled();
  });

  test("reports store-backed interactive failures when the store did not surface an error", async () => {
    const error = new Error("missing visible error");
    const reportFailure = vi.fn();

    startStoreBackedChatInteractiveAction(
      "send-pending-steering",
      async () => {
        throw error;
      },
      reportFailure,
    );
    await flushAsyncAction();

    expect(reportFailure).toHaveBeenCalledWith({
      error,
      name: "send-pending-steering",
    });
  });
});

async function flushAsyncAction() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
