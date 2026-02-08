export function dedupeInFlightJson<TParam, TResult>(
  cache: Map<string, Promise<TResult>>,
  param: TParam,
  fn: (param: TParam) => Promise<TResult>,
  keyFn?: (param: TParam) => string | null,
): Promise<TResult> {
  let key: string | null = null;
  if (keyFn) {
    try {
      const computed = keyFn(param);
      if (typeof computed === "string" && computed.trim()) {
        key = computed;
      }
    } catch {
      key = null;
    }
  } else {
    try {
      const computed = JSON.stringify(param);
      if (typeof computed === "string" && computed.trim()) {
        key = computed;
      }
    } catch {
      key = null;
    }
  }

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
