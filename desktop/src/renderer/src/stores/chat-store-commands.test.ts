import type {
  ChatCommandDescriptor,
  Conversation,
  HarnessThreadRef,
  Run,
  RunStatus,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";

describe("chat store command listing", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
    useChatStore.setState({
      commandDescriptorCache: {},
      commandListError: null,
      commandListStatus: "idle",
      error: null,
      selectedConversation: testConversation(),
      workspaceId: "workspace_api",
    });
  });

  test("exposes command-list failures without setting the global chat error", async () => {
    const listCommands = vi.fn().mockRejectedValue(new Error("command registry failed"));
    installCommandAPI(listCommands);

    await expect(useChatStore.getState().listCommands()).rejects.toThrow("command registry failed");

    expect(listCommands).toHaveBeenCalledWith("workspace_api", "conversation_api");
    expect(useChatStore.getState().commandListStatus).toBe("failed");
    expect(useChatStore.getState().commandListError).toBe("command registry failed");
    expect(useChatStore.getState().error).toBeNull();
  });

  test("caches command descriptors for the same selected command context", async () => {
    const listCommands = vi.fn().mockResolvedValue({ commands: [goalDescriptor()] });
    installCommandAPI(listCommands);

    await expect(useChatStore.getState().listCommands()).resolves.toEqual({
      commands: [goalDescriptor()],
    });
    await expect(useChatStore.getState().listCommands()).resolves.toEqual({
      commands: [goalDescriptor()],
    });

    expect(listCommands).toHaveBeenCalledOnce();
    expect(useChatStore.getState().commandListStatus).toBe("loaded");
    expect(useChatStore.getState().commandListError).toBeNull();
  });

  test("separates cached descriptors by active-run availability state", async () => {
    const listCommands = vi
      .fn()
      .mockResolvedValueOnce({ commands: [goalDescriptor("Goal while idle")] })
      .mockResolvedValueOnce({ commands: [goalDescriptor("Goal while active")] });
    installCommandAPI(listCommands);

    await useChatStore.getState().listCommands();
    useChatStore.setState({ activeRun: testRun("running") });
    await expect(useChatStore.getState().listCommands()).resolves.toEqual({
      commands: [goalDescriptor("Goal while active")],
    });

    expect(listCommands).toHaveBeenCalledTimes(2);
  });

  test("separates cached descriptors by selected harness refs", async () => {
    const listCommands = vi
      .fn()
      .mockResolvedValueOnce({ commands: [goalDescriptor("Goal without ref")] })
      .mockResolvedValueOnce({ commands: [goalDescriptor("Goal with ref")] });
    installCommandAPI(listCommands);

    await useChatStore.getState().listCommands();
    useChatStore.setState({
      selectedConversation: testConversation({
        harnessRefs: [testHarnessRef({ threadId: "thread_next" })],
      }),
    });
    await expect(useChatStore.getState().listCommands()).resolves.toEqual({
      commands: [goalDescriptor("Goal with ref")],
    });

    expect(listCommands).toHaveBeenCalledTimes(2);
  });

  test("does not cache failed command descriptor requests", async () => {
    const listCommands = vi
      .fn()
      .mockRejectedValueOnce(new Error("command registry failed"))
      .mockResolvedValueOnce({ commands: [goalDescriptor()] });
    installCommandAPI(listCommands);

    await expect(useChatStore.getState().listCommands()).rejects.toThrow("command registry failed");
    await expect(useChatStore.getState().listCommands()).resolves.toEqual({
      commands: [goalDescriptor()],
    });

    expect(listCommands).toHaveBeenCalledTimes(2);
    expect(useChatStore.getState().commandListStatus).toBe("loaded");
    expect(useChatStore.getState().commandListError).toBeNull();
  });

  test("settles stale command descriptor failures without sticking loading", async () => {
    let rejectRequest: (error: Error) => void = () => {};
    const listCommands = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectRequest = reject;
        }),
    );
    installCommandAPI(listCommands);

    const request = useChatStore.getState().listCommands();
    expect(useChatStore.getState().commandListStatus).toBe("loading");

    useChatStore.setState({
      selectedConversation: testConversation({ id: "conversation_next" }),
    });
    rejectRequest(new Error("command registry failed"));

    await expect(request).rejects.toThrow("command registry failed");
    expect(useChatStore.getState().commandListStatus).toBe("idle");
    expect(useChatStore.getState().commandListError).toBeNull();
  });

  test("does not let stale command descriptor failures override newer requests", async () => {
    let rejectFirstRequest: (error: Error) => void = () => {};
    const listCommands = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirstRequest = reject;
          }),
      )
      .mockResolvedValueOnce({ commands: [goalDescriptor("Goal while active")] });
    installCommandAPI(listCommands);

    const firstRequest = useChatStore.getState().listCommands();
    useChatStore.setState({ activeRun: testRun("running") });
    const secondRequest = useChatStore.getState().listCommands();

    rejectFirstRequest(new Error("command registry failed"));

    await expect(firstRequest).rejects.toThrow("command registry failed");
    await expect(secondRequest).resolves.toEqual({
      commands: [goalDescriptor("Goal while active")],
    });
    expect(useChatStore.getState().commandListStatus).toBe("loaded");
    expect(useChatStore.getState().commandListError).toBeNull();
  });
});

function installCommandAPI(listCommands: ReturnType<typeof vi.fn>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: { chat: { listCommands } } as unknown as SettaAPI,
    },
  });
}

function goalDescriptor(description = "Goal"): ChatCommandDescriptor {
  return {
    available: true,
    description,
    grammar: {
      arguments: [
        {
          description: "Open the goal editor.",
          kind: "literal",
          token: "edit",
        },
        {
          description: "Set objective.",
          kind: "free_text",
          maxRunes: 4000,
          name: "objective",
          required: false,
        },
      ],
      literalMatch: "exact",
      summary: "/goal [objective|edit|clear|pause|resume]",
    },
    kind: "goal",
    name: "/goal",
    unavailableReason: "",
  };
}

function testConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    archivedAt: "",
    codexEffectiveSettings: null,
    codexSettings: null,
    createdAt: "2026-06-05T20:00:00Z",
    harnessRefs: [],
    id: "conversation_api",
    internal: false,
    schemaVersion: 1,
    title: "Test",
    updatedAt: "2026-06-05T20:00:00Z",
    workflow: null,
    workspaceId: "workspace_api",
    ...overrides,
    easyRun: overrides.easyRun ?? null,
  };
}

function testHarnessRef(overrides: Partial<HarnessThreadRef> = {}): HarnessThreadRef {
  return {
    createdAt: "2026-06-05T20:00:00Z",
    harness: "codex",
    lastResumedAt: "2026-06-05T20:00:00Z",
    lastTurnId: "turn_api",
    sessionId: "session_api",
    status: "linked",
    threadId: "thread_api",
    unavailableMessage: "",
    ...overrides,
  };
}

function testRun<T extends RunStatus>(status: T): Run & { status: T } {
  return {
    assistantMessageId: "message_assistant",
    completedAt: "",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    id: "run_api",
    pendingApproval: null,
    promptSummary: "running",
    schemaVersion: 1,
    startedAt: "2026-06-05T20:00:00Z",
    status,
    triggerMessageId: "message_user",
    workspaceId: "workspace_api",
  };
}
