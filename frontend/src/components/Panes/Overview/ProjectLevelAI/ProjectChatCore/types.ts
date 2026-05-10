import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import { type Dispatch, type SetStateAction } from "react";
import {
  type ChatDictationMode,
  type EngineConfig,
} from "utils/generatedTypes";
import { type ProjectChatBlockedErrorCode } from "../projectChatCoreUtils";
import { type ProjectChatHydrationAuthority } from "../projectChatHydrationAuthority";

export type ProjectChatCoreProps = {
  surfaceId: string;
  chatId: string | null | undefined;
  draftMessage: string;
  setDraftMessage: Dispatch<SetStateAction<string>>;
  placeholderText: string;
  conversationFilterText: string;
  requiresNewThreadContinuation?: boolean;
  newThreadContinuationRequiredReason?: string | null;
  newThreadSeedChatId?: string | null;
  activeConversationSearchMatchIndex?: number | null;
  hydrationAuthority: ProjectChatHydrationAuthority;
  hydrationMetadataRevision: string;
  thinking: boolean;
  engineConfigId: string | null;
  engineConfig: EngineConfig | null;
  engineType: EngineConfig["engineType"] | null;
  hasLLMConfig: boolean;
  externalEngineAvailable: boolean;
  noLLMConfigsAvailable: boolean;
  transcriptionProfileId: string | null;
  dictationMode: ChatDictationMode;
  providerDictationAvailable: boolean;
  providerDictationLikelySupported: boolean;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
  onConversationSearchMatchCountChange?: ((count: number) => void) | undefined;
  onStartNewChat?: (() => void) | undefined;
  onDraftThreadStart?: (() => void) | undefined;
  onDraftThreadSettled?:
    | ((nextChatId: string | null, succeeded: boolean) => void)
    | undefined;
  onThinkingChange?: ((nextThinking: boolean) => void) | undefined;
  onPermissionModeChange?:
    | ((nextPermissionMode: ChatPermissionModeValue) => void)
    | undefined;
  onBlockedErrorCodeChange?:
    | ((errorCode: ProjectChatBlockedErrorCode | null) => void)
    | undefined;
};
