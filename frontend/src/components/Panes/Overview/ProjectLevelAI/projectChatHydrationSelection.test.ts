import { describe, expect, it } from "vitest";

import { createEngineConfig, EngineTypeEnum } from "utils/generatedTypes";
import {
  buildProjectChatEngineConfigByChatId,
  buildProjectChatHydrationMetadataRevision,
  resolveProjectChatHistoryCompatibility,
} from "./projectChatHydrationSelection";

describe("resolveProjectChatHistoryCompatibility", () => {
  it("returns null when the selected engine does not map to a project history run type", () => {
    // The history list should stay unfiltered until the surface can prove a concrete run type.
    const compatibility = resolveProjectChatHistoryCompatibility(
      null,
      "engine-a",
    );

    expect(compatibility).toBeNull();
  });

  it("keeps the selected engine id alongside the resolved run type", () => {
    // History filtering needs both the run type and engine config id to keep mixed-engine threads separated.
    const compatibility = resolveProjectChatHistoryCompatibility(
      "llm_chat",
      "engine-a",
    );

    expect(compatibility).toEqual({
      runType: "llm_chat",
      engineConfigId: "engine-a",
    });
  });
});

describe("buildProjectChatEngineConfigByChatId", () => {
  it("maps each chat id to the engine config id captured in provenance", () => {
    // ProjectChat uses this lookup to keep thread hydration and engine switching aligned per chat.
    const engineConfigByChatId = buildProjectChatEngineConfigByChatId(
      new Map([
        [
          "chat-a",
          {
            runType: "llm_chat",
            engineConfigId: "engine-a",
          },
        ],
        [
          "chat-b",
          {
            runType: "external_agent",
            engineConfigId: null,
          },
        ],
      ]),
    );

    expect(engineConfigByChatId).toEqual(
      new Map([
        ["chat-a", "engine-a"],
        ["chat-b", null],
      ]),
    );
  });
});

describe("buildProjectChatHydrationMetadataRevision", () => {
  it("returns a stable no-selected-chat marker when no concrete chat is selected", () => {
    // The hydration effect should skip work entirely until a real chat id exists.
    const revision = buildProjectChatHydrationMetadataRevision({
      chatId: "   ",
      chatProvenanceByChatIdMap: new Map(),
      engineConfigById: new Map(),
      selectedChatHydrationAuthority: {
        status: "ready",
        hydrationRunType: "llm_chat",
        blockedErrorCode: null,
      },
      selectedChatRunWatermark: 0,
      agentRunsAuthorityState: "loading",
      agentRunsLoadError: null,
      engineConfigsInitialLoadComplete: false,
      engineConfigsLoadError: null,
    });

    expect(revision).toBe("no-selected-chat");
  });

  it("changes when the selected chat watermark or resolved engine metadata changes", () => {
    // Hydration retries must rerun when either provenance timing or engine metadata changes for the selected chat.
    const chatProvenanceByChatIdMap = new Map([
      [
        "chat-a",
        {
          runType: "llm_chat",
          engineConfigId: "engine-a",
        },
      ],
    ]);
    const readyAuthority = {
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: null,
    } as const;
    const baselineRevision = buildProjectChatHydrationMetadataRevision({
      chatId: "chat-a",
      chatProvenanceByChatIdMap,
      engineConfigById: new Map([
        [
          "engine-a",
          createEngineConfig({
            id: "engine-a",
            name: "Alpha",
            engineType: EngineTypeEnum.setta_llm,
            settaLlmConfigId: "llm-a",
          }),
        ],
      ]),
      selectedChatHydrationAuthority: readyAuthority,
      selectedChatRunWatermark: 10,
      agentRunsAuthorityState: "ready",
      agentRunsLoadError: null,
      engineConfigsInitialLoadComplete: true,
      engineConfigsLoadError: null,
    });
    const changedRevision = buildProjectChatHydrationMetadataRevision({
      chatId: "chat-a",
      chatProvenanceByChatIdMap,
      engineConfigById: new Map([
        [
          "engine-a",
          createEngineConfig({
            id: "engine-a",
            name: "Alpha",
            engineType: EngineTypeEnum.setta_llm,
            settaLlmConfigId: "llm-b",
          }),
        ],
      ]),
      selectedChatHydrationAuthority: readyAuthority,
      selectedChatRunWatermark: 11,
      agentRunsAuthorityState: "ready",
      agentRunsLoadError: null,
      engineConfigsInitialLoadComplete: true,
      engineConfigsLoadError: null,
    });

    expect(changedRevision).not.toBe(baselineRevision);
  });
});
