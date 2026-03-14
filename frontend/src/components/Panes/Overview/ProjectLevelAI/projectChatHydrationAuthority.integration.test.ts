import { EngineTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildProjectChatHydrationCacheKey } from "./ProjectChatCore";
import { resolveProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";

describe("project chat hydration authority integration", () => {
  const resolvedEngineConfigId = "engine-llm-resolved";
  const resolvedExternalEngineConfigId = "engine-external-resolved";
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
    [
      resolvedExternalEngineConfigId,
      {
        id: resolvedExternalEngineConfigId,
        name: "Resolved External",
        engineType: EngineTypeEnum.external_agent,
        externalAgentConfigId: "external-resolved",
        settaLlmConfigId: null,
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
      projectConfigId: "project-1",
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
      projectConfigId: "project-1",
      chatId: "chat-1",
      hydrationRunType: authorityAfterResolution.hydrationRunType,
      hydrationMetadataRevision: "rev-1",
    });

    expect(authorityAfterResolution).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: null,
    });
    expect(resolvedCacheKey).toBe("project-1:chat-1:llm_chat:rev-1");
  });

  it("keeps hydration cache-key inputs resolved when authoritative metadata reports a missing engine config", () => {
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
      projectConfigId: "project-1",
      chatId: "chat-1",
      hydrationRunType: authority.hydrationRunType,
      hydrationMetadataRevision: "rev-1",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: "engine_config_missing",
    });
    expect(cacheKey).toBe("project-1:chat-1:llm_chat:rev-1");
  });

  it("keeps waiting selected chats ready for fallback hydration once authoritative metadata confirms provenance is missing", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-in-flight",
      selectedScopedChatProvenance: { status: "missing" },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      engineType: EngineTypeEnum.setta_llm,
    });
    const cacheKey = buildProjectChatHydrationCacheKey({
      projectConfigId: "project-1",
      chatId: "chat-in-flight",
      hydrationRunType: authority.hydrationRunType,
      hydrationMetadataRevision: "rev-in-flight",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: null,
      blockedErrorCode: "chat_provenance_missing",
    });
    expect(cacheKey).toBeNull();
  });

  it("blocks hydration when authoritative metadata is missing provenance", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-missing-provenance",
      selectedScopedChatProvenance: { status: "missing" },
      chatProvenanceAuthoritative: true,
      engineConfigById: resolvedEngineConfigById,
      engineConfigsAuthoritative: true,
      engineType: EngineTypeEnum.setta_llm,
    });
    const cacheKey = buildProjectChatHydrationCacheKey({
      projectConfigId: "project-1",
      chatId: "chat-missing-provenance",
      hydrationRunType: authority.hydrationRunType,
      hydrationMetadataRevision: "rev-missing-provenance",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: null,
      blockedErrorCode: "chat_provenance_missing",
    });
    expect(cacheKey).toBeNull();
  });

  it("uses provenance run type for compatible entries even when current engine type differs", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-compatible-provenance",
      selectedScopedChatProvenance: {
        status: "ready",
        provenance: {
          runType: "external_agent",
          engineConfigId: resolvedExternalEngineConfigId,
        },
      },
      chatProvenanceAuthoritative: true,
      engineConfigById: resolvedEngineConfigById,
      engineConfigsAuthoritative: true,
      engineType: EngineTypeEnum.setta_llm,
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: "external_agent",
      blockedErrorCode: null,
    });
  });

  it("routes ambiguous provenance through warning compatibility instead of a compatible fallback", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-ambiguous-provenance",
      selectedScopedChatProvenance: { status: "ambiguous" },
      chatProvenanceAuthoritative: true,
      engineConfigById: resolvedEngineConfigById,
      engineConfigsAuthoritative: true,
      engineType: EngineTypeEnum.external_agent,
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: null,
      blockedErrorCode: "chat_provenance_missing",
    });
  });

  it("keeps ambiguous provenance unresolved while run metadata is non-authoritative", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-ambiguous-non-authoritative",
      selectedScopedChatProvenance: { status: "ambiguous" },
      chatProvenanceAuthoritative: false,
      engineConfigById: resolvedEngineConfigById,
      engineConfigsAuthoritative: true,
      engineType: EngineTypeEnum.external_agent,
    });

    expect(authority).toEqual({
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    });
  });
});
