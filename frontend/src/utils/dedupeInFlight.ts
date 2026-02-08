export function dedupeInFlightJson<TParam, TResult>(
  cache: Map<string, Promise<TResult>>,
  param: TParam,
  fn: (param: TParam) => Promise<TResult>,
): Promise<TResult> {
  let key: string | null = null;
  try {
    key = JSON.stringify(param);
  } catch {
    key = null;
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
