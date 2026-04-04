type ContextUsageTelemetrySource =
  | {
      contextWindowTokens?: number | null;
      contextUsedTokens?: number | null;
      estimated?: boolean | null;
    }
  | null
  | undefined;

export type ChatContextTelemetry = {
  contextWindowTokens: number | null;
  contextUsedTokens: number | null;
  contextUsageIsEstimated: boolean;
};

export function normalizeContextTokenCount(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number") {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

export function resolveAuthoritativeContextTelemetry(
  contextUsage: ContextUsageTelemetrySource,
): ChatContextTelemetry {
  const contextWindowTokens = normalizeContextTokenCount(
    contextUsage?.contextWindowTokens,
  );
  const contextUsedTokens = normalizeContextTokenCount(
    contextUsage?.contextUsedTokens,
  );
  return {
    contextWindowTokens,
    contextUsedTokens,
    contextUsageIsEstimated: Boolean(contextUsage?.estimated),
  };
}
