import _ from "lodash";
import { AllLLMConfigs, LLMConfig, ObjectValues } from "utils/generatedTypes";

export const ChatLLMConfigMatchStatusEnum = {
  MATCHED: "matched",
  STALE: "stale",
  UNKNOWN: "unknown",
} as const;

export type ChatLLMConfigMatchStatus = ObjectValues<
  typeof ChatLLMConfigMatchStatusEnum
>;

export type ChatLLMConfigSelection = {
  chatLLMConfig: LLMConfig | null;
  matchedConfigId: string | null;
  matchStatus: ChatLLMConfigMatchStatus;
};

function otherParamsEqual(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return _.isEqual(a, b);
}

function fieldEquals<T extends keyof LLMConfig>(
  snapshot: LLMConfig,
  candidate: LLMConfig,
  field: T,
): boolean {
  return (snapshot[field] ?? null) === (candidate[field] ?? null);
}

function evaluateMatchTier(
  chatLLMConfig: LLMConfig,
  candidate: LLMConfig,
): number {
  if (!chatLLMConfig.model) {
    return 0;
  }
  const sameModel = fieldEquals(chatLLMConfig, candidate, "model");
  if (!sameModel) {
    return 0;
  }
  const sameProvider = fieldEquals(chatLLMConfig, candidate, "provider");
  const sameBaseUrl = fieldEquals(chatLLMConfig, candidate, "base_url");
  const sameApiKeyEnv = fieldEquals(chatLLMConfig, candidate, "api_key_env");
  const sameOtherParams = otherParamsEqual(
    chatLLMConfig.other_params,
    candidate.other_params,
  );

  if (sameProvider && sameBaseUrl && sameApiKeyEnv && sameOtherParams) {
    return 5;
  }
  if (sameProvider && sameBaseUrl && sameOtherParams) {
    return 4;
  }
  if (sameProvider) {
    return 3;
  }
  if (sameBaseUrl) {
    return 2;
  }
  return 1;
}

type MatchResult = {
  id: string;
  score: number;
  isDefault: boolean;
};

export function matchConfigIdForChatLLMConfig(
  chatLLMConfig: LLMConfig | null | undefined,
  liveConfigs: AllLLMConfigs | null | undefined,
): string | null {
  if (!chatLLMConfig || !liveConfigs) {
    return null;
  }

  const results: MatchResult[] = [];
  for (const [configId, candidate] of Object.entries(liveConfigs.configs)) {
    const score = evaluateMatchTier(chatLLMConfig, candidate);
    if (score === 0) {
      continue;
    }
    results.push({
      id: configId,
      score,
      isDefault: liveConfigs.default_config_id === configId,
    });
  }

  if (results.length === 0) {
    return null;
  }

  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.isDefault !== b.isDefault) {
      return Number(b.isDefault) - Number(a.isDefault);
    }
    return a.id.localeCompare(b.id);
  });

  return results[0]?.id ?? null;
}

export function computeConfigSelectionForChat(
  chatLLMConfig: LLMConfig | null | undefined,
  liveConfigs: AllLLMConfigs | null | undefined,
): ChatLLMConfigSelection {
  const chatConfig = chatLLMConfig ?? null;
  const matchedConfigId = matchConfigIdForChatLLMConfig(
    chatConfig,
    liveConfigs,
  );
  const matchStatus = deriveMatchStatus(
    chatConfig,
    matchedConfigId,
    liveConfigs,
  );
  return {
    chatLLMConfig: chatConfig,
    matchedConfigId,
    matchStatus,
  };
}

function deriveMatchStatus(
  chatLLMConfig: LLMConfig | null,
  matchedConfigId: string | null,
  liveConfigs: AllLLMConfigs | null | undefined,
): ChatLLMConfigMatchStatus {
  if (!chatLLMConfig) {
    return ChatLLMConfigMatchStatusEnum.UNKNOWN;
  }
  if (!liveConfigs) {
    return ChatLLMConfigMatchStatusEnum.UNKNOWN;
  }
  return matchedConfigId
    ? ChatLLMConfigMatchStatusEnum.MATCHED
    : ChatLLMConfigMatchStatusEnum.STALE;
}
