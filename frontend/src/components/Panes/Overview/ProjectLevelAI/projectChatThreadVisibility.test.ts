import { describe, expect, it } from "vitest";
import {
  resolveProjectChatEngineConfigIdForSelectedChat,
  resolveProjectChatThreadBlockedErrorCodeForSelectedChat,
  resolveProjectChatThreadVisibilityFromResize,
} from "./ProjectChat";

describe("resolveProjectChatThreadVisibilityFromResize", () => {
  it("defaults to chat-only on initial narrow layouts", () => {
    // If persisted state still has threads open, narrow layouts should start in chat-only mode.
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: true,
        wasLargeEnoughForInlineThreads: false,
        isLargeEnoughForInlineThreads: false,
        viewThreads: true,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBe(false);
  });

  it("auto-shows threads on initial wide layouts unless manually closed", () => {
    // Wide layouts can restore inline threads by default.
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: true,
        wasLargeEnoughForInlineThreads: true,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBe(true);

    // Manual large-width close preference should block auto-show.
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: true,
        wasLargeEnoughForInlineThreads: true,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: true,
      }),
    ).toBeNull();
  });

  it("hides threads when crossing from large to narrow", () => {
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: false,
        wasLargeEnoughForInlineThreads: true,
        isLargeEnoughForInlineThreads: false,
        viewThreads: true,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBe(false);
  });

  it("shows threads when crossing from narrow to large unless manually closed", () => {
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: false,
        wasLargeEnoughForInlineThreads: false,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBe(true);

    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: false,
        wasLargeEnoughForInlineThreads: false,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: true,
      }),
    ).toBeNull();
  });

  it("does nothing when no resize breakpoint transition occurred", () => {
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: false,
        wasLargeEnoughForInlineThreads: true,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBeNull();
  });
});

describe("resolveProjectChatEngineConfigIdForSelectedChat", () => {
  it("returns null when no chat is selected", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: null,
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a", "engine-b"]),
      chatEngineConfigByChatId: new Map([["chat-1", "engine-b"]]),
    });
    expect(resolved).toBeNull();
  });

  it("returns null when selected chat has no persisted engine config", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: "chat-1",
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a", "engine-b"]),
      chatEngineConfigByChatId: new Map([["chat-1", null]]),
    });
    expect(resolved).toBeNull();
  });

  it("returns null when persisted engine config is missing from available configs", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: "chat-1",
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a"]),
      chatEngineConfigByChatId: new Map([["chat-1", "engine-b"]]),
    });
    expect(resolved).toBeNull();
  });

  it("returns null when the selected engine already matches the chat engine", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: "chat-1",
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a", "engine-b"]),
      chatEngineConfigByChatId: new Map([["chat-1", "engine-a"]]),
    });
    expect(resolved).toBeNull();
  });

  it("returns the chat's persisted engine when it differs from the selected engine", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: "chat-1",
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a", "engine-b"]),
      chatEngineConfigByChatId: new Map([["chat-1", "engine-b"]]),
    });
    expect(resolved).toBe("engine-b");
  });
});

describe("resolveProjectChatThreadBlockedErrorCodeForSelectedChat", () => {
  it("returns compatible when no chat is selected", () => {
    const result = resolveProjectChatThreadBlockedErrorCodeForSelectedChat({
      chatId: null,
      chatProvenanceByChatId: new Map(),
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
    });
    expect(result).toEqual({ status: "compatible" });
  });

  it("blocks when selected chat has missing provenance", () => {
    const result = resolveProjectChatThreadBlockedErrorCodeForSelectedChat({
      chatId: "chat-1",
      chatProvenanceByChatId: new Map(),
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
    });
    expect(result).toEqual({
      status: "blocked",
      errorCode: "chat_provenance_missing",
    });
  });

  it("blocks when selected chat has missing engine metadata in provenance", () => {
    const result = resolveProjectChatThreadBlockedErrorCodeForSelectedChat({
      chatId: "chat-1",
      chatProvenanceByChatId: new Map([
        [
          "chat-1",
          {
            runType: "llm_chat",
            engineConfigId: null,
          },
        ],
      ]),
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
    });
    expect(result).toEqual({
      status: "blocked",
      errorCode: "chat_provenance_missing",
    });
  });

  it("returns unknown when local engine cache is not authoritative", () => {
    const result = resolveProjectChatThreadBlockedErrorCodeForSelectedChat({
      chatId: "chat-1",
      chatProvenanceByChatId: new Map([
        [
          "chat-1",
          {
            runType: "llm_chat",
            engineConfigId: "engine-llm",
          },
        ],
      ]),
      engineConfigById: new Map(),
      engineConfigsAuthoritative: false,
    });
    expect(result).toEqual({ status: "unknown" });
  });

  it("blocks when selected chat run type mismatches persisted engine type", () => {
    const result = resolveProjectChatThreadBlockedErrorCodeForSelectedChat({
      chatId: "chat-1",
      chatProvenanceByChatId: new Map([
        [
          "chat-1",
          {
            runType: "llm_chat",
            engineConfigId: "engine-external",
          },
        ],
      ]),
      engineConfigById: new Map([
        [
          "engine-external",
          {
            id: "engine-external",
            name: "External Engine",
            engineType: "external_agent",
            externalAgentConfigId: "ext-config",
            settaLlmConfigId: null,
          },
        ],
      ]),
      engineConfigsAuthoritative: true,
    });
    expect(result).toEqual({
      status: "blocked",
      errorCode: "engine_type_mismatch",
    });
  });

  it("returns compatible when selected chat provenance is available and compatible", () => {
    const result = resolveProjectChatThreadBlockedErrorCodeForSelectedChat({
      chatId: "chat-1",
      chatProvenanceByChatId: new Map([
        [
          "chat-1",
          {
            runType: "llm_chat",
            engineConfigId: "engine-llm",
          },
        ],
      ]),
      engineConfigById: new Map([
        [
          "engine-llm",
          {
            id: "engine-llm",
            name: "LLM Engine",
            engineType: "setta_llm",
            settaLlmConfigId: "primary",
            externalAgentConfigId: null,
          },
        ],
      ]),
      engineConfigsAuthoritative: true,
    });
    expect(result).toEqual({ status: "compatible" });
  });
});
