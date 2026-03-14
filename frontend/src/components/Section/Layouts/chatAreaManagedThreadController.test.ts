import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import {
  AgentRunStatusEnum,
  ChatRoleEnum,
  createAgentRun,
  createMessageTextContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resumeLatestManagedSectionChat,
  selectManagedSectionChat,
  setManagedSectionChatId,
  settleManagedSectionChatThreadStart,
  startManagedSectionChatThread,
} from "./chatAreaManagedThreadController";

function buildRun({
  chatId,
  startedAt,
  sectionId = "section-1",
  projectConfigId = "project-1",
  runType = "llm_chat",
  engineConfigId = "engine-1",
}: {
  chatId: string;
  startedAt: string;
  sectionId?: string;
  projectConfigId?: string;
  runType?: "llm_chat" | "external_agent" | "scriptable_chat";
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
      sectionId,
      projectConfigId,
      engineConfigId,
      messages: [
        {
          id: `msg-${chatId}`,
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: `Prompt for ${chatId}` })],
          attachments: [],
        },
      ],
    },
  });
}

describe("chatAreaManagedThreadController", () => {
  it("updates controlled managed chat ids without touching persisted state", () => {
    const controlledUpdates: Array<string | null> = [];
    const persistedUpdates: Array<string | null> = [];

    setManagedSectionChatId({
      next: "chat-b",
      canUseManagedChat: true,
      chatId: "chat-a",
      setControlledChatId: (next) => {
        controlledUpdates.push(
          typeof next === "function" ? next("chat-a") : next,
        );
      },
      resolvePersistedChatId: () => "persisted-chat",
      persistChatId: (chatId) => {
        persistedUpdates.push(chatId);
      },
    });

    expect(controlledUpdates).toEqual(["chat-b"]);
    expect(persistedUpdates).toEqual([]);
  });

  it("persists uncontrolled managed chat ids based on the current stored chat id", () => {
    const persistedUpdates: Array<string | null> = [];

    setManagedSectionChatId({
      next: (currentChatId) =>
        currentChatId === "chat-a" ? "chat-b" : currentChatId,
      canUseManagedChat: true,
      chatId: null,
      resolvePersistedChatId: () => "chat-a",
      persistChatId: (chatId) => {
        persistedUpdates.push(chatId);
      },
    });

    expect(persistedUpdates).toEqual(["chat-b"]);
  });

  it("starts a managed section chat thread by clearing history and initializing pending chat details", () => {
    const initializedSurfaceIds: string[] = [];
    const chatIdUpdates: Array<string | null> = [];
    const historyVisibility: boolean[] = [];

    startManagedSectionChatThread({
      canUseManagedChat: true,
      surfaceId: "surface-1",
      setChatId: (next) => {
        chatIdUpdates.push(typeof next === "function" ? next("chat-a") : next);
      },
      setShowHistory: (next) => {
        historyVisibility.push(next);
      },
      initializePendingChat: (surfaceId) => {
        initializedSurfaceIds.push(surfaceId);
      },
    });

    expect(initializedSurfaceIds).toEqual(["surface-1"]);
    expect(chatIdUpdates).toEqual([null]);
    expect(historyVisibility).toEqual([false]);
  });

  it("settles a managed section chat start by clearing pending state and only filling empty chat ids", () => {
    let resolvedFromEmpty: string | null | undefined;
    let resolvedFromExisting: string | null | undefined;
    const clearedSurfaceIds: string[] = [];

    settleManagedSectionChatThreadStart({
      surfaceId: "surface-1",
      newChatId: "chat-new",
      succeeded: true,
      setChatId: (next) => {
        if (typeof next !== "function") {
          throw new Error("Expected updater function");
        }
        resolvedFromEmpty = next(null);
        resolvedFromExisting = next("chat-existing");
      },
      clearPendingChat: (surfaceId) => {
        clearedSurfaceIds.push(surfaceId);
      },
    });

    expect(clearedSurfaceIds).toEqual(["surface-1"]);
    expect(resolvedFromEmpty).toBe("chat-new");
    expect(resolvedFromExisting).toBe("chat-existing");
  });

  it("selects a managed section chat and closes history", () => {
    const selectedChatIds: Array<string | null> = [];
    const historyVisibility: boolean[] = [];

    selectManagedSectionChat({
      nextChatId: "chat-b",
      setChatId: (next) => {
        selectedChatIds.push(typeof next === "function" ? next(null) : next);
      },
      setShowHistory: (next) => {
        historyVisibility.push(next);
      },
    });

    expect(selectedChatIds).toEqual(["chat-b"]);
    expect(historyVisibility).toEqual([false]);
  });

  it("resumes the latest managed section chat from compatible history", async () => {
    const selectedChatIds: Array<string | null> = [];
    const historyVisibility: boolean[] = [];
    const loadAgentRunsCalls: number[] = [];
    const historyCompatibility: ChatHistoryCompatibility = {
      runType: "llm_chat",
      engineConfigId: "engine-1",
    };
    const agentRuns = [
      buildRun({
        chatId: "chat-a",
        startedAt: "2024-01-01T00:00:00Z",
      }),
      buildRun({
        chatId: "chat-b",
        startedAt: "2024-01-02T00:00:00Z",
      }),
    ];

    const resumed = await resumeLatestManagedSectionChat({
      canUseManagedChat: true,
      chatId: "chat-a",
      projectConfigId: "project-1",
      sectionId: "section-1",
      historyCompatibility,
      agentRuns,
      setChatId: (next) => {
        selectedChatIds.push(typeof next === "function" ? next(null) : next);
      },
      setShowHistory: (next) => {
        historyVisibility.push(next);
      },
      dependencies: {
        loadAgentRuns: async () => {
          loadAgentRunsCalls.push(1);
        },
      },
    });

    expect(resumed).toBe(true);
    expect(loadAgentRunsCalls).toEqual([1]);
    expect(selectedChatIds).toEqual(["chat-b"]);
    expect(historyVisibility).toEqual([false]);
  });

  it("returns false when there is no alternate managed chat to resume", async () => {
    const historyCompatibility: ChatHistoryCompatibility = {
      runType: "llm_chat",
      engineConfigId: "engine-1",
    };

    const resumed = await resumeLatestManagedSectionChat({
      canUseManagedChat: true,
      chatId: "chat-a",
      projectConfigId: "project-1",
      sectionId: "section-1",
      historyCompatibility,
      agentRuns: [
        buildRun({
          chatId: "chat-a",
          startedAt: "2024-01-01T00:00:00Z",
        }),
      ],
      setChatId: () => {
        throw new Error("should not select a chat");
      },
      setShowHistory: () => {
        throw new Error("should not toggle history");
      },
      dependencies: {
        loadAgentRuns: async () => undefined,
      },
    });

    expect(resumed).toBe(false);
  });
});
