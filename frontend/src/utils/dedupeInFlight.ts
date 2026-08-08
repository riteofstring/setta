function normalizeInFlightKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (!value.trim()) {
    return null;
  }
  return value;
}

function resolveInFlightKey<TParam>(
  param: TParam,
  keyFn?: (param: TParam) => string | null,
): string | null {
  try {
    if (keyFn) {
      return normalizeInFlightKey(keyFn(param));
    }
    return normalizeInFlightKey(JSON.stringify(param));
  } catch {
    return null;
  }
}

export function dedupeInFlightJson<TParam, TResult>(
  cache: Map<string, Promise<TResult>>,
  param: TParam,
  fn: (param: TParam) => Promise<TResult>,
  keyFn?: (param: TParam) => string | null,
): Promise<TResult> {
  const key = resolveInFlightKey(param, keyFn);
  if (!key) {
    return fn(param);
  }

  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const promise = fn(param).finally(() => {
    cache.delete(key);
  });
  cache.set(key, promise);
  return promise;
}
