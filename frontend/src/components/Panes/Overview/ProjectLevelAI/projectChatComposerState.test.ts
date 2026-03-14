import {
  createAssistantChatMessage,
  createToolCall,
  createToolCallFunction,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { resolveProjectChatComposerDerivedState } from "./projectChatComposerState";

describe("resolveProjectChatComposerDerivedState", () => {
  it("derives disabled and edit states from new-thread continuation requirements", () => {
    const permissionHandler = vi.fn();
    const searchHandler = vi.fn();

    const result = resolveProjectChatComposerDerivedState({
      requiresNewThreadContinuation: true,
      engineConfigId: "engine-1",
      hasLLMConfig: true,
      isExternalEngine: false,
      externalEngineAvailable: true,
      noLLMConfigsAvailable: false,
      newThreadContinuationRequiredReason: "Continue in a new thread first.",
      messages: [],
      waitingForResponse: false,
      engineType: EngineTypeEnum.setta_llm,
      thinking: true,
      onThinkingChange: vi.fn(),
      executionSettings: {
        permissionMode: "minimal",
        searchEnabled: true,
      },
      executionControlHandlers: {
        onPermissionModeChange: permissionHandler,
        onSearchEnabledChange: searchHandler,
      },
      normalizedConversationSearchTerms: [],
      hasVisibleConversationMatches: true,
      providerDictationAvailable: true,
      showEmptyState: false,
      contextUsageUnavailable: true,
    });

    expect(result.isDisabled).toBe(true);
    expect(result.editDisabledReason).toBe("Continue in a new thread first.");
    expect(result.submitDisabled).toBe(true);
    expect(result.executionControls.permissionMode).toBe("minimal");
    expect(result.executionControls.searchEnabled).toBe(true);
    expect(result.executionControls.onPermissionModeChange).toBe(
      permissionHandler,
    );
    expect(result.executionControls.onSearchEnabledChange).toBe(searchHandler);
  });

  it("counts active runtime activity from unfinished tool calls while waiting", () => {
    const result = resolveProjectChatComposerDerivedState({
      requiresNewThreadContinuation: false,
      engineConfigId: "engine-1",
      hasLLMConfig: true,
      isExternalEngine: false,
      externalEngineAvailable: true,
      noLLMConfigsAvailable: false,
      newThreadContinuationRequiredReason: null,
      messages: [
        createAssistantChatMessage({
          tool_calls: [
            createToolCall({
              id: "terminal-1",
              function: createToolCallFunction({
                name: "command_execution",
              }),
            }),
            createToolCall({
              id: "subagent-1",
              function: createToolCallFunction({
                name: "run_agent_profile",
              }),
            }),
          ],
        }),
      ],
      waitingForResponse: true,
      engineType: EngineTypeEnum.external_agent,
      thinking: true,
      onThinkingChange: vi.fn(),
      executionSettings: {
        permissionMode: "config_toml_custom",
        searchEnabled: false,
      },
      executionControlHandlers: {
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
      normalizedConversationSearchTerms: [],
      hasVisibleConversationMatches: true,
      providerDictationAvailable: false,
      showEmptyState: false,
      contextUsageUnavailable: false,
    });

    expect(result.runtimeActivityCounts).toEqual({
      activeBackgroundTerminals: 1,
      activeSubagents: 1,
    });
    expect(result.executionControls.onThinkingEnabledChange).toBeTypeOf(
      "function",
    );
  });

  it("computes search-empty and context telemetry display state for the input surface", () => {
    const result = resolveProjectChatComposerDerivedState({
      requiresNewThreadContinuation: false,
      engineConfigId: "engine-1",
      hasLLMConfig: true,
      isExternalEngine: false,
      externalEngineAvailable: true,
      noLLMConfigsAvailable: false,
      newThreadContinuationRequiredReason: null,
      messages: [],
      waitingForResponse: false,
      engineType: null,
      thinking: false,
      onThinkingChange: vi.fn(),
      executionSettings: {
        permissionMode: "minimal",
        searchEnabled: false,
      },
      executionControlHandlers: {
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
      normalizedConversationSearchTerms: ["filter"],
      hasVisibleConversationMatches: false,
      providerDictationAvailable: true,
      showEmptyState: true,
      contextUsageUnavailable: true,
    });

    expect(result.showConversationSearchEmptyState).toBe(true);
    expect(result.chatInputContextUsageUnavailable).toBe(false);
    expect(result.providerDictationTranscribeEnabled).toBe(true);
    expect(result.executionControls.onThinkingEnabledChange).toBeUndefined();
  });

  it("disables submit when a pending approval interaction exists", () => {
    const result = resolveProjectChatComposerDerivedState({
      requiresNewThreadContinuation: false,
      engineConfigId: "engine-1",
      hasLLMConfig: true,
      isExternalEngine: false,
      externalEngineAvailable: true,
      noLLMConfigsAvailable: false,
      newThreadContinuationRequiredReason: null,
      messages: [
        createAssistantChatMessage({
          tool_calls: [
            createToolCall({
              id: "approval-1",
              function: createToolCallFunction({
                name: "setta.approval",
              }),
            }),
          ],
        }),
      ],
      waitingForResponse: false,
      engineType: EngineTypeEnum.setta_llm,
      thinking: false,
      onThinkingChange: vi.fn(),
      executionSettings: {
        permissionMode: "minimal",
        searchEnabled: false,
      },
      executionControlHandlers: {
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
      normalizedConversationSearchTerms: [],
      hasVisibleConversationMatches: true,
      providerDictationAvailable: false,
      showEmptyState: false,
      contextUsageUnavailable: false,
    });

    expect(result.submitDisabled).toBe(true);
  });
});
