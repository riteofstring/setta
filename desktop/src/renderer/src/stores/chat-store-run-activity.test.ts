import type {
  Conversation,
  RunItem,
  RunItemOutput,
  RunItemStatus,
  RunItemType,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";
import {
  runItemCreatedEvent,
  runItemOutputDeltaEvent,
  runItemUpdatedEvent,
} from "./chat-store-events.test.helpers";

// Raw run items / outputs are kept only for detail surfaces (the transcript renders
// from blocks), so they are populated by run-item events and the lazy
// loadRunActivity / loadRunItemOutput endpoints keyed by source run item ID.
describe("chat store run-item detail surface", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  test("applies run item events incrementally", () => {
    const conversation = testConversation();
    const item = runItem("run_item_command", "command_execution", "running");
    const completed: RunItem = { ...item, status: "completed", exitCode: 0 };
    const output = runItemOutput("run_item_output_1", item.id, 1, "ok\n");
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      workspaceId: "workspace_api",
    });

    useChatStore.getState().handleEvent(runItemCreatedEvent(1, item));
    useChatStore.getState().handleEvent(runItemUpdatedEvent(2, completed));
    useChatStore.getState().handleEvent(runItemOutputDeltaEvent(3, output));
    useChatStore.getState().handleEvent(runItemOutputDeltaEvent(3, output));

    expect(useChatStore.getState().runItems).toEqual([completed]);
    expect(useChatStore.getState().runItemOutputs).toEqual([output]);
    expect(useChatStore.getState().runItemIdsByRunId.run_api).toEqual([completed.id]);
    expect(useChatStore.getState().runItemOutputIdsByRunItemId[completed.id]).toEqual([output.id]);
  });

  test("lazy-loads run activity without dropping embedded output", async () => {
    const item = runItem("run_item_command", "command_execution", "running");
    const completed: RunItem = { ...item, status: "completed" };
    const firstOutput = runItemOutput("run_item_output_1", item.id, 1, "first\n");
    const secondOutput = runItemOutput("run_item_output_2", item.id, 2, "second\n");
    const runActivity = vi.fn().mockResolvedValue({
      items: [completed],
      output: [secondOutput],
      runId: "run_api",
    });
    installChatAPI({ runActivity });
    useChatStore.setState({
      runItemOutputs: [firstOutput],
      runItems: [item],
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().loadRunActivity("run_api", 200);

    expect(runActivity).toHaveBeenCalledWith("workspace_api", "run_api", 200);
    expect(useChatStore.getState().runItems).toEqual([completed]);
    expect(useChatStore.getState().runItemOutputs).toEqual([firstOutput, secondOutput]);
  });

  test("lazy-loads run item output for only the expanded row", async () => {
    const itemA = runItem("run_item_a", "command_execution", "completed");
    const itemB = runItem("run_item_b", "command_execution", "completed");
    const outputA = runItemOutput("run_item_output_a1", itemA.id, 1, "a1\n");
    const outputB = runItemOutput("run_item_output_b1", itemB.id, 1, "b1\n");
    const runItemOutputPage = vi.fn().mockResolvedValue({
      hasMore: false,
      nextOrdinal: 0,
      output: [outputB],
      runId: "run_api",
      runItemId: itemB.id,
    });
    installChatAPI({ runItemOutput: runItemOutputPage });
    useChatStore.setState({
      runItemOutputs: [outputA],
      runItems: [itemA, itemB],
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().loadRunItemOutput("run_api", itemB.id, 0, 200);

    expect(runItemOutputPage).toHaveBeenCalledWith("workspace_api", "run_api", itemB.id, 0, 200);
    expect(useChatStore.getState().runItemOutputs).toEqual([outputA, outputB]);
  });

  test("tracks run item output pagination per item", async () => {
    const itemA = runItem("run_item_a", "command_execution", "completed");
    const itemB = runItem("run_item_b", "command_execution", "completed");
    const outputA1 = runItemOutput("run_item_output_a1", itemA.id, 1, "a1\n");
    const outputA2 = runItemOutput("run_item_output_a2", itemA.id, 2, "a2\n");
    const outputB1 = runItemOutput("run_item_output_b1", itemB.id, 1, "b1\n");
    const runItemOutputPage = vi
      .fn()
      .mockResolvedValueOnce({
        hasMore: true,
        nextOrdinal: 1,
        output: [outputA1],
        runId: "run_api",
        runItemId: itemA.id,
      })
      .mockResolvedValueOnce({
        hasMore: false,
        nextOrdinal: 0,
        output: [outputB1],
        runId: "run_api",
        runItemId: itemB.id,
      })
      .mockResolvedValueOnce({
        hasMore: false,
        nextOrdinal: 0,
        output: [outputA1, outputA2],
        runId: "run_api",
        runItemId: itemA.id,
      });
    installChatAPI({ runItemOutput: runItemOutputPage });
    useChatStore.setState({
      runItems: [itemA, itemB],
      workspaceId: "workspace_api",
    });

    await useChatStore.getState().loadRunItemOutput("run_api", itemA.id, 0, 1);
    await useChatStore.getState().loadRunItemOutput("run_api", itemB.id, 0, 1);
    await useChatStore.getState().loadRunItemOutput("run_api", itemA.id, 1, 2);

    expect(runItemOutputPage).toHaveBeenNthCalledWith(
      3,
      "workspace_api",
      "run_api",
      itemA.id,
      1,
      2,
    );
    expect(useChatStore.getState().runItemOutputs.map((output) => output.id)).toEqual([
      outputA1.id,
      outputA2.id,
      outputB1.id,
    ]);
    expect(useChatStore.getState().runItemOutputPagesByRunItemId[itemA.id]).toMatchObject({
      hasMore: false,
      loadedThroughOrdinal: 2,
      nextOrdinal: 0,
    });
    expect(useChatStore.getState().runItemOutputPagesByRunItemId[itemB.id]).toMatchObject({
      hasMore: false,
      loadedThroughOrdinal: 1,
    });
  });
});

function installChatAPI(chat: Partial<SettaAPI["chat"]>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: { chat } },
  });
}

function testConversation(): Conversation {
  return {
    archivedAt: "",
    codexEffectiveSettings: null,
    codexSettings: null,
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id: "conversation_api",
    internal: false,
    schemaVersion: 1,
    title: "API chat",
    updatedAt: "2026-05-29T20:00:00Z",
    workflow: null,
    workspaceId: "workspace_api",
  };
}

function runItem(id: string, type: RunItemType, status: RunItemStatus): RunItem {
  return {
    command: "go test ./...",
    completedAt: "",
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    cwd: "/tmp/workspace",
    details: null,
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
    filePaths: [],
    hiddenText: "",
    id,
    namespace: "",
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    processId: "",
    progress: "",
    providerItemId: "provider_" + id,
    requestId: "",
    result: "",
    reviewId: "",
    runId: "run_api",
    schemaVersion: 1,
    serverName: "",
    startedAt: "2026-05-29T20:00:00Z",
    status,
    summary: "",
    title: "",
    toolName: "",
    type,
    workspaceId: "workspace_api",
  };
}

function runItemOutput(
  id: string,
  runItemId: string,
  ordinal: number,
  text: string,
): RunItemOutput {
  return {
    createdAt: "2026-05-29T20:00:00Z",
    id,
    ordinal,
    runItemId,
    schemaVersion: 1,
    stream: "stdout",
    text,
  };
}
