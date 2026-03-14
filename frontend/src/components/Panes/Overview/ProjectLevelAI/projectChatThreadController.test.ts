import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import {
  AgentRunStatusEnum,
  ChatRoleEnum,
  createAgentRun,
  createMessageTextContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resumeLatestProjectChat,
  selectProjectChatThread,
  settleProjectChatThreadStart,
  startProjectChatThread,
} from "./projectChatThreadController";

function buildRun({
  chatId,
  startedAt,
  projectConfigId = "project-1",
  runType = "llm_chat",
  engineConfigId = "engine-1",
}: {
  chatId: string;
  startedAt: string;
  projectConfigId?: string;
  runType?: "llm_chat" | "external_agent";
  engineConfigId?: string | null;
}) {
  return createAgentRun({
    id: `run-${chatId}-${startedAt}`,
    status: AgentRunStatusEnum.completed,
    startedAt,
    finishedAt: startedAt,
    inputs: {
      runType,
      chatId,
      projectConfigId,
      engineConfigId,
      messages: [
        {
          id: `message-${chatId}`,
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: `Prompt for ${chatId}` })],
          attachments: [],
        },
      ],
    },
  });
}

describe("projectChatThreadController", () => {
  it("starts an uncontrolled draft thread by initializing pending chat details", () => {
    const initializedSurfaceIds: string[] = [];
    const chatIdUpdates: Array<string | null | undefined> = [];

    startProjectChatThread({
      chatId: "chat-1",
      surfaceId: "surface-1",
      onDraftThreadStart: () => undefined,
      setChatId: (nextChatId) => {
        chatIdUpdates.push(
          typeof nextChatId === "function" ? nextChatId("chat-1") : nextChatId,
        );
      },
      initializePendingChat: (surfaceId) => {
        initializedSurfaceIds.push(surfaceId);
      },
    });

    expect(initializedSurfaceIds).toEqual(["surface-1"]);
    expect(chatIdUpdates).toEqual([null]);
  });

  it("delegates to the controlled new-thread callback without mutating chat id", () => {
    const lifecycleEvents: string[] = [];

    startProjectChatThread({
      chatId: "chat-1",
      surfaceId: "surface-1",
      onStartNewChat: () => {
        lifecycleEvents.push("start");
      },
      onDraftThreadStart: () => {
        lifecycleEvents.push("draft");
      },
      setChatId: () => {
        throw new Error("should not set chat id");
      },
    });

    expect(lifecycleEvents).toEqual(["start"]);
  });

  it("settles a failed draft thread by clearing pending state and restoring undefined only from null", () => {
    const clearedSurfaceIds: string[] = [];
    let resolvedFromNull: string | null | undefined;
    let resolvedFromExisting: string | null | undefined;

    settleProjectChatThreadStart({
      newChatId: null,
      succeeded: false,
      surfaceId: "surface-1",
      setChatId: (nextChatId) => {
        if (typeof nextChatId !== "function") {
          throw new Error("expected updater");
        }
        resolvedFromNull = nextChatId(null);
        resolvedFromExisting = nextChatId("chat-existing");
      },
      clearPendingChat: (surfaceId) => {
        clearedSurfaceIds.push(surfaceId);
      },
    });

    expect(clearedSurfaceIds).toEqual(["surface-1"]);
    expect(resolvedFromNull).toBeUndefined();
    expect(resolvedFromExisting).toBe("chat-existing");
  });

  it("resumes the latest compatible project chat", async () => {
    const selectedChatIds: Array<string | null | undefined> = [];
    const historyCompatibility: ChatHistoryCompatibility = {
      runType: "llm_chat",
      engineConfigId: "engine-1",
    };

    const resumed = await resumeLatestProjectChat({
      chatId: "chat-a",
      projectConfigId: "project-1",
      historyCompatibility,
      agentRuns: [
        buildRun({
          chatId: "chat-a",
          startedAt: "2024-01-01T00:00:00Z",
        }),
        buildRun({
          chatId: "chat-b",
          startedAt: "2024-01-02T00:00:00Z",
        }),
      ],
      setChatId: (nextChatId) => {
        selectedChatIds.push(
          typeof nextChatId === "function" ? nextChatId(null) : nextChatId,
        );
      },
      dependencies: {
        loadAgentRuns: async () => undefined,
      },
    });

    expect(resumed).toBe(true);
    expect(selectedChatIds).toEqual(["chat-b"]);
  });

  it("avoids reselecting the active project chat thread", () => {
    let selectedChatId: string | null | undefined = "unmodified";

    selectProjectChatThread({
      nextChatId: "chat-a",
      chatId: "chat-a",
      setChatId: (nextChatId) => {
        selectedChatId =
          typeof nextChatId === "function" ? nextChatId("chat-a") : nextChatId;
      },
    });

    expect(selectedChatId).toBe("unmodified");
  });
});
