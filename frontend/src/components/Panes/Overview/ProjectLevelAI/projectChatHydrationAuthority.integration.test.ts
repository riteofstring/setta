import { EngineTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildProjectChatHydrationCacheKey } from "./ProjectChatCore";
import { resolveProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";

describe("project chat hydration authority integration", () => {
  const resolvedEngineConfigId = "engine-llm-resolved";
  const resolvedEngineConfigById = new Map([
    [
      resolvedEngineConfigId,
      {
        id: resolvedEngineConfigId,
        name: "Resolved LLM",
        engineType: EngineTypeEnum.setta_llm,
        externalAgentConfigId: null,
        settaLlmConfigId: "llm-resolved",
      },
    ],
  ]);

  it("keeps hydration cache-key inputs unresolved until engine config metadata is authoritative", () => {
    const authorityWhileLoading = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: {
        status: "ready",
        provenance: {
          runType: "llm_chat",
          engineConfigId: resolvedEngineConfigId,
        },
      },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: false,
      engineType: EngineTypeEnum.setta_llm,
    });
    const loadingCacheKey = buildProjectChatHydrationCacheKey({
      chatId: "chat-1",
      hydrationRunType: authorityWhileLoading.hydrationRunType,
      hydrationMetadataRevision: "rev-1",
    });

    expect(authorityWhileLoading).toEqual({
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    });
    expect(loadingCacheKey).toBeNull();

    const authorityAfterResolution = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: {
        status: "ready",
        provenance: {
          runType: "llm_chat",
          engineConfigId: resolvedEngineConfigId,
        },
      },
      chatProvenanceAuthoritative: true,
      engineConfigById: resolvedEngineConfigById,
      engineConfigsAuthoritative: true,
      engineType: EngineTypeEnum.setta_llm,
    });
    const resolvedCacheKey = buildProjectChatHydrationCacheKey({
      chatId: "chat-1",
      hydrationRunType: authorityAfterResolution.hydrationRunType,
      hydrationMetadataRevision: "rev-1",
    });

    expect(authorityAfterResolution).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: null,
    });
    expect(resolvedCacheKey).toBe("chat-1:llm_chat:rev-1");
  });

  it("keeps hydration cache-key inputs unresolved when authoritative metadata reports a missing engine config", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: {
        status: "ready",
        provenance: {
          runType: "llm_chat",
          engineConfigId: "engine-missing",
        },
      },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      engineType: EngineTypeEnum.setta_llm,
    });
    const cacheKey = buildProjectChatHydrationCacheKey({
      chatId: "chat-1",
      hydrationRunType: authority.hydrationRunType,
      hydrationMetadataRevision: "rev-1",
    });

    expect(authority).toEqual({
      status: "blocked",
      hydrationRunType: null,
      blockedErrorCode: "engine_config_missing",
    });
    expect(cacheKey).toBeNull();
  });

  it("keeps hydration unresolved while selected chat is still waiting and provenance has not appeared yet", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-in-flight",
      selectedScopedChatProvenance: { status: "missing" },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      selectedChatWaitingForResponse: true,
      engineType: EngineTypeEnum.setta_llm,
    });
    const cacheKey = buildProjectChatHydrationCacheKey({
      chatId: "chat-in-flight",
      hydrationRunType: authority.hydrationRunType,
      hydrationMetadataRevision: "rev-in-flight",
    });

    expect(authority).toEqual({
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    });
    expect(cacheKey).toBeNull();
  });
});
