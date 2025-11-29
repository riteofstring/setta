import isEqual from "lodash/isEqual";

import { AllLLMConfigs, LLMConfig } from "utils/generatedTypes";

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
  return isEqual(a, b);
}

function fieldEquals<T extends keyof LLMConfig>(
  snapshot: LLMConfig,
  candidate: LLMConfig,
  field: T,
): boolean {
  return (snapshot[field] ?? null) === (candidate[field] ?? null);
}

function evaluateMatchTier(
  snapshot: LLMConfig,
  candidate: LLMConfig,
): number {
  if (!snapshot.model) {
    return 0;
  }
  const sameModel = fieldEquals(snapshot, candidate, "model");
  if (!sameModel) {
    return 0;
  }
  const sameProvider = fieldEquals(snapshot, candidate, "provider");
  const sameBaseUrl = fieldEquals(snapshot, candidate, "base_url");
  const sameApiKeyEnv = fieldEquals(snapshot, candidate, "api_key_env");
  const sameOtherParams = otherParamsEqual(
    snapshot.other_params,
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

export function matchConfigIdForSnapshot(
  snapshot: LLMConfig | null | undefined,
  liveConfigs: AllLLMConfigs | null | undefined,
): string | null {
  if (!snapshot || !liveConfigs) {
    return null;
  }

  const results: MatchResult[] = [];
  for (const [configId, candidate] of Object.entries(liveConfigs.configs)) {
    const score = evaluateMatchTier(snapshot, candidate);
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
