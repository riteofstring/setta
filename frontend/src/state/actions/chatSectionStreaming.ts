import { setCurrEffectiveSectionImplValue } from "state/actions/sectionInfos";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { ChatSectionState, SectionTypeEnum } from "utils/generatedTypes";
import { getChatSectionStateFromStore } from "./chatSectionAuthority";
import {
  applyStreamDeltaToChatSectionState,
  type ChatSectionStreamChunk,
} from "./chatStreamState";

export type { ChatSectionStreamChunk } from "./chatStreamState";

export function applyChatSectionStreamDelta(
  sectionId: string,
  chunk: ChatSectionStreamChunk,
): ChatSectionState | null {
  let nextState: ChatSectionState | null = null;
  useProjectState.setState((state) => {
    const currentState = getChatSectionStateFromStore(state, sectionId);
    if (!currentState) {
      return;
    }
    nextState = applyStreamDeltaToChatSectionState(currentState, chunk);
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      inputText: nextState.inputText,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
      activeBranchId: nextState.activeBranchId,
      branches: nextState.branches,
    });
  });
  return nextState;
}

type ChatIdLookupCache = {
  projectConfigId: string;
  sectionVariantMap: ZustandProjectState["projectConfig"]["sectionVariantMap"];
  sectionVariants: ZustandProjectState["sectionVariants"];
  sectionImpls: ZustandProjectState["sectionImpls"];
  sections: ZustandProjectState["sections"];
  map: Map<string, string>;
};

let chatIdLookupCache: ChatIdLookupCache | null = null;

function buildChatIdLookup(state: ZustandProjectState): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [sectionId, variantId] of Object.entries(
    state.projectConfig.sectionVariantMap,
  )) {
    const variant = state.sectionVariants[variantId];
    if (!variant) {
      continue;
    }
    const impl = state.sectionImpls[variant.impl];
    if (!impl) {
      continue;
    }
    const core = state.sections[sectionId];
    if (!core) {
      continue;
    }
    const effective = {
      ...impl,
      ...core.sharedModifier,
      ...variant.modifier,
    };
    if (effective.type !== SectionTypeEnum.Chat) {
      continue;
    }
    const candidate =
      typeof effective.chatId === "string" && effective.chatId.trim()
        ? effective.chatId
        : null;
    if (!candidate) {
      continue;
    }
    lookup.set(candidate, sectionId);
  }
  return lookup;
}

export function resolveSectionIdForChatId(chatId: string): string | null {
  const state = useProjectState.getState();
  const shouldRebuild =
    !chatIdLookupCache ||
    chatIdLookupCache.projectConfigId !== state.projectConfig.id ||
    chatIdLookupCache.sectionVariantMap !==
      state.projectConfig.sectionVariantMap ||
    chatIdLookupCache.sectionVariants !== state.sectionVariants ||
    chatIdLookupCache.sectionImpls !== state.sectionImpls ||
    chatIdLookupCache.sections !== state.sections;
  if (shouldRebuild) {
    chatIdLookupCache = {
      projectConfigId: state.projectConfig.id,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      sections: state.sections,
      map: buildChatIdLookup(state),
    };
  }
  return chatIdLookupCache.map.get(chatId) ?? null;
}
