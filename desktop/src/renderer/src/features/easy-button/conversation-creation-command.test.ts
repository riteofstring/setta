import type { ConversationSnapshot } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import { conversationSelectedFrameMissingReason } from "../../workspace-layout/conversation-pane-coordinator";
import {
  createAndPresentConversation,
  enqueueConversationPlacementPreflight,
  newConversationTitle,
} from "./conversation-creation-command";

describe("conversation creation command", () => {
  test("preflights exact placement before creating durable conversation state", async () => {
    const createConversation = vi.fn();
    const preflightPlacement = vi
      .fn()
      .mockRejectedValue(new Error(conversationSelectedFrameMissingReason));

    await expect(
      createAndPresentConversation({
        createConversation,
        ensureWorkspaceAvailable: vi.fn(),
        ensureWorkspaceSelected: vi.fn(),
        hydrateSnapshot: vi.fn(),
        preflightPlacement,
        presentConversation: vi.fn(),
        request: {
          destination: { kind: "empty-frame", paneId: "workspace_pane_missing" },
          workspaceId: "workspace_api",
        },
      }),
    ).rejects.toThrow(conversationSelectedFrameMissingReason);

    expect(preflightPlacement).toHaveBeenCalledWith({
      destination: { kind: "empty-frame", paneId: "workspace_pane_missing" },
      workspaceId: "workspace_api",
    });
    expect(createConversation).not.toHaveBeenCalled();
  });

  test("creates, hydrates, and presents a new-pane conversation", async () => {
    const snapshot = conversationSnapshot("conversation_created", "workspace_api");
    const hydrateSnapshot = vi.fn();
    const presentConversation = vi.fn().mockResolvedValue({
      kind: "opened",
      paneId: "workspace_pane_created",
    });

    await expect(
      createAndPresentConversation({
        createConversation: vi.fn().mockResolvedValue(snapshot),
        ensureWorkspaceAvailable: vi.fn(),
        ensureWorkspaceSelected: vi.fn(),
        hydrateSnapshot,
        preflightPlacement: vi.fn().mockResolvedValue(undefined),
        presentConversation,
        request: {
          destination: { kind: "new-pane" },
          workspaceId: "workspace_api",
        },
      }),
    ).resolves.toEqual({
      conversationId: "conversation_created",
      paneId: "workspace_pane_created",
      workspaceId: "workspace_api",
    });

    expect(hydrateSnapshot).toHaveBeenCalledWith(snapshot);
    expect(presentConversation).toHaveBeenCalledWith({
      conversationId: "conversation_created",
      destination: { kind: "new-pane" },
      title: newConversationTitle,
      viewAction: "focus-or-open",
      workspaceId: "workspace_api",
    });
  });

  test("keeps the created conversation when presentation fails after creation", async () => {
    const snapshot = conversationSnapshot("conversation_created", "workspace_api");
    const hydrateSnapshot = vi.fn();

    await expect(
      createAndPresentConversation({
        createConversation: vi.fn().mockResolvedValue(snapshot),
        ensureWorkspaceAvailable: vi.fn(),
        ensureWorkspaceSelected: vi.fn(),
        hydrateSnapshot,
        preflightPlacement: vi.fn().mockResolvedValue(undefined),
        presentConversation: vi
          .fn()
          .mockRejectedValue(new Error(conversationSelectedFrameMissingReason)),
        request: {
          destination: { kind: "empty-frame", paneId: "workspace_pane_missing" },
          workspaceId: "workspace_api",
        },
      }),
    ).rejects.toThrow("The conversation was created, but its frame no longer exists.");

    expect(hydrateSnapshot).toHaveBeenCalledWith(snapshot);
  });

  test("serializes placement preflights before dispatching through renderer state", async () => {
    const firstPreflight = deferred<void>();
    const preflightPlacement = vi
      .fn()
      .mockImplementationOnce(() => firstPreflight.promise)
      .mockResolvedValueOnce(undefined);
    const queue = { current: Promise.resolve() };

    const first = enqueueConversationPlacementPreflight(queue, preflightPlacement, {
      destination: { kind: "empty-frame", paneId: "workspace_pane_empty" },
      workspaceId: "workspace_api",
    });
    const second = enqueueConversationPlacementPreflight(queue, preflightPlacement, {
      destination: { kind: "new-pane" },
      workspaceId: "workspace_api",
    });

    await flushPromises();

    expect(preflightPlacement).toHaveBeenCalledTimes(1);
    firstPreflight.resolve();
    await first;
    await second;

    expect(preflightPlacement).toHaveBeenNthCalledWith(1, {
      destination: { kind: "empty-frame", paneId: "workspace_pane_empty" },
      workspaceId: "workspace_api",
    });
    expect(preflightPlacement).toHaveBeenNthCalledWith(2, {
      destination: { kind: "new-pane" },
      workspaceId: "workspace_api",
    });
  });

  test("continues queued placement preflights after a blocked request", async () => {
    const preflightPlacement = vi
      .fn()
      .mockRejectedValueOnce(new Error(conversationSelectedFrameMissingReason))
      .mockResolvedValueOnce(undefined);
    const queue = { current: Promise.resolve() };

    await expect(
      enqueueConversationPlacementPreflight(queue, preflightPlacement, {
        destination: { kind: "empty-frame", paneId: "workspace_pane_missing" },
        workspaceId: "workspace_api",
      }),
    ).rejects.toThrow(conversationSelectedFrameMissingReason);
    await expect(
      enqueueConversationPlacementPreflight(queue, preflightPlacement, {
        destination: { kind: "new-pane" },
        workspaceId: "workspace_api",
      }),
    ).resolves.toBeUndefined();

    expect(preflightPlacement).toHaveBeenCalledTimes(2);
  });
});

function conversationSnapshot(conversationId: string, workspaceId: string): ConversationSnapshot {
  return {
    conversation: {
      id: conversationId,
      title: newConversationTitle,
      workspaceId,
    },
  } as ConversationSnapshot;
}

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | null = null;
  let reject: Deferred<T>["reject"] | null = null;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  if (!resolve || !reject) {
    throw new Error("deferred promise callbacks were not initialized");
  }
  return { promise, reject, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
