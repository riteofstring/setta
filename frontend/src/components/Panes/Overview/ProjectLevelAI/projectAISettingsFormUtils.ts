export function parseListInput(value: string): Array<string> {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

type JsonParseResult = {
  value: Record<string, unknown>;
  error: string | null;
};

type OptionalJsonParseResult = {
  value: Record<string, unknown> | null;
  error: string | null;
};

export function parseJsonObject(value: string): JsonParseResult {
  if (!value.trim()) {
    return { value: {}, error: null };
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: {}, error: "JSON must be an object." };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return { value: {}, error: "Invalid JSON." };
  }
}

export function parseOptionalJsonObject(
  value: string,
): OptionalJsonParseResult {
  if (!value.trim()) {
    return { value: null, error: null };
  }
  const result = parseJsonObject(value);
  if (result.error) {
    return { value: null, error: result.error };
  }
  return { value: result.value, error: null };
}
