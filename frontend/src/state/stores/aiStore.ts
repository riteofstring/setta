import type {
  AgentProfile,
  AgentRun,
  AllLLMConfigs,
  APIKeys,
  BaseChatMessageUnion,
  EngineConfig,
  ExternalAgentConfig,
  ExternalAgentPreflightStatus,
  LLMConfig,
  PromptTemplate,
  TranscriptionProfile,
} from "utils/generatedTypes";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import { getPersistStorage } from "./persistStorage";

export type ChatDetails = {
  messages: Array<BaseChatMessageUnion>;
  toolCallArguments: Record<string, string>;
  waitingForResponse: boolean;
  llmConfig: LLMConfig | null;
  contextUsage: {
    contextWindowTokens: number | null;
    contextUsedTokens: number | null;
    estimated: boolean;
  } | null;
};

export type ChatBranchInfo = {
  chatId: string;
  branchParentChatId: string | null;
  branchFromMessageId: string | null;
  branchRootChatId: string | null;
  branchCreatedAt: number | null;
};

type ZustandAIStore = {
  apiKeys: APIKeys;
  apiKeysRevision: number;
  apiKeysAuthoritative: boolean;
  apiKeysInitialLoadComplete: boolean;
  apiKeysLoadError: string | null;
  activeChatId: string | null | undefined;
  projectChatSelectedEngineId: string | null;
  chatDetails: Record<string, ChatDetails>;
  pendingChatDetailsBySurfaceId: Record<string, ChatDetails>;
  interruptedAssistantMessageIdsByChatId: Record<string, Record<string, true>>;
  viewThreads: boolean;
  projectChatThreadsExplicitlyClosedAtLargeWidth: boolean;
  projectChatActivityAccordionOpenByDefault: boolean;
  projectChatActivityChildrenOpenByDefault: boolean;
  allLLMConfigs: AllLLMConfigs | null;
  allLLMConfigsInitialLoadComplete: boolean;
  allLLMConfigsLoadError: string | null;
  agentProfiles: Array<AgentProfile>;
  agentProfilesInitialLoadComplete: boolean;
  agentProfilesLoadError: string | null;
  agentProfilesLoading: boolean;
  agentRuns: Array<AgentRun>;
  agentRunsAuthorityState:
    | "loading"
    | "ready"
    | "transient_error"
    | "terminal_error";
  agentRunsInitialLoadComplete: boolean;
  agentRunsLoadError: string | null;
  promptTemplates: Array<PromptTemplate>;
  promptTemplatesInitialLoadComplete: boolean;
  promptTemplatesLoadError: string | null;
  promptTemplatesLoading: boolean;
  externalAgentConfigs: Array<ExternalAgentConfig>;
  externalAgentConfigsInitialLoadComplete: boolean;
  externalAgentConfigsLoadError: string | null;
  externalAgentConfigsLoading: boolean;
  externalAgentHealth: Array<ExternalAgentPreflightStatus>;
  externalAgentHealthInitialLoadComplete: boolean;
  externalAgentHealthLoadError: string | null;
  externalAgentHealthLoading: boolean;
  engineConfigs: Array<EngineConfig>;
  engineConfigsInitialLoadComplete: boolean;
  engineConfigsLoadError: string | null;
  engineConfigsLoading: boolean;
  transcriptionProfiles: Array<TranscriptionProfile>;
  transcriptionProfilesInitialLoadComplete: boolean;
  transcriptionProfilesLoadError: string | null;
  transcriptionProfilesLoading: boolean;
  pendingProjectChatPrompt: string | null;
  projectChatDictationMode: "auto" | "browser" | "provider";
  projectChatTranscriptionProfileId: string | null;
};

export const useAIStore = createWithEqualityFn<ZustandAIStore>()(
  // @ts-expect-error Zustand's persist function doesn't work well with types
  subscribeWithSelector(
    persist(
      () => ({
        apiKeys: {},
        apiKeysRevision: 0,
        apiKeysAuthoritative: false,
        apiKeysInitialLoadComplete: false,
        apiKeysLoadError: null,
        activeChatId: undefined,
        projectChatSelectedEngineId: null,
        chatDetails: {},
        pendingChatDetailsBySurfaceId: {},
        interruptedAssistantMessageIdsByChatId: {},
        viewThreads: false,
        projectChatThreadsExplicitlyClosedAtLargeWidth: false,
        projectChatActivityAccordionOpenByDefault: false,
        projectChatActivityChildrenOpenByDefault: false,
        allLLMConfigs: null,
        allLLMConfigsInitialLoadComplete: false,
        allLLMConfigsLoadError: null,
        agentProfiles: [],
        agentProfilesInitialLoadComplete: false,
        agentProfilesLoadError: null,
        agentProfilesLoading: false,
        agentRuns: [],
        agentRunsAuthorityState: "loading",
        agentRunsInitialLoadComplete: false,
        agentRunsLoadError: null,
        promptTemplates: [],
        promptTemplatesInitialLoadComplete: false,
        promptTemplatesLoadError: null,
        promptTemplatesLoading: false,
        externalAgentConfigs: [],
        externalAgentConfigsInitialLoadComplete: false,
        externalAgentConfigsLoadError: null,
        externalAgentConfigsLoading: false,
        externalAgentHealth: [],
        externalAgentHealthInitialLoadComplete: false,
        externalAgentHealthLoadError: null,
        externalAgentHealthLoading: false,
        engineConfigs: [],
        engineConfigsInitialLoadComplete: false,
        engineConfigsLoadError: null,
        engineConfigsLoading: false,
        transcriptionProfiles: [],
        transcriptionProfilesInitialLoadComplete: false,
        transcriptionProfilesLoadError: null,
        transcriptionProfilesLoading: false,
        pendingProjectChatPrompt: null,
        projectChatDictationMode: "auto",
        projectChatTranscriptionProfileId: null,
      }),
      {
        name: "setta_ai_data",
        merge: (persistedState, currentState) => {
          const persisted =
            (persistedState as Partial<ZustandAIStore> | null) ?? {};
          return {
            ...currentState,
            ...persisted,
          };
        },
        partialize: (state) => ({
          viewThreads: state.viewThreads,
          projectChatThreadsExplicitlyClosedAtLargeWidth:
            state.projectChatThreadsExplicitlyClosedAtLargeWidth,
          projectChatActivityAccordionOpenByDefault:
            state.projectChatActivityAccordionOpenByDefault,
          projectChatActivityChildrenOpenByDefault:
            state.projectChatActivityChildrenOpenByDefault,
          projectChatDictationMode: state.projectChatDictationMode,
          projectChatTranscriptionProfileId:
            state.projectChatTranscriptionProfileId,
          projectChatSelectedEngineId: state.projectChatSelectedEngineId,
        }),
        storage: getPersistStorage(),
      },
    ),
  ),
);
