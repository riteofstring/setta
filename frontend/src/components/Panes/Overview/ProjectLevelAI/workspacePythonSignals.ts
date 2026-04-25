import { getWorkspacePythonSignal } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { dedupeInFlightJson } from "utils/dedupeInFlight";
import { res200 } from "utils/endpointUtils";
type WorkspacePythonSignalCacheEntry = {
  hasPython: boolean;
  cachedAtMs: number;
};
export type WorkspacePythonSignalCache = Map<
  string,
  WorkspacePythonSignalCacheEntry
>;
const WORKSPACE_PYTHON_SIGNAL_CACHE_TTL_MS = 15000;
const WORKSPACE_PYTHON_SIGNAL_CACHE_MAX_ENTRIES = 128;
const inFlightWorkspacePythonSignalLoads = new Map<
  string,
  Promise<boolean | null>
>();
function getCachedWorkspacePythonSignal(
  cache: WorkspacePythonSignalCache,
  rootPath: string,
  nowMs: number = Date.now(),
  ttlMs: number = WORKSPACE_PYTHON_SIGNAL_CACHE_TTL_MS,
): boolean | null {
  const cached = cache.get(rootPath);
  if (!cached) {
    return null;
  }
  if (
    typeof cached.hasPython !== "boolean" ||
    typeof cached.cachedAtMs !== "number"
  ) {
    cache.delete(rootPath);
    return null;
  }
  if (nowMs - cached.cachedAtMs > ttlMs) {
    cache.delete(rootPath);
    return null;
  }
  return cached.hasPython;
}
function setCachedWorkspacePythonSignal(
  cache: WorkspacePythonSignalCache,
  rootPath: string,
  hasPython: boolean,
  nowMs: number = Date.now(),
  maxEntries: number = WORKSPACE_PYTHON_SIGNAL_CACHE_MAX_ENTRIES,
): void {
  if (cache.has(rootPath)) {
    cache.delete(rootPath);
  }
  cache.set(rootPath, {
    hasPython,
    cachedAtMs: nowMs,
  });
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== "string") {
      return;
    }
    cache.delete(oldestKey);
  }
}
export function loadWorkspacePythonSignal({
  cache,
  rootPath,
  revalidate = false,
}: {
  cache: WorkspacePythonSignalCache;
  rootPath: string;
  revalidate?: boolean;
}): Promise<boolean | null> {
  const normalizedRootPath = rootPath.trim();
  if (!normalizedRootPath) {
    return Promise.resolve(null);
  }
  if (!revalidate) {
    const cached = getCachedWorkspacePythonSignal(cache, normalizedRootPath);
    if (cached !== null) {
      return Promise.resolve(cached);
    }
  }
  return dedupeInFlightJson(
    inFlightWorkspacePythonSignalLoads,
    { rootPath: normalizedRootPath },
    async ({ rootPath: nextRootPath }) => {
      const response = await callOpenAPI(
        getWorkspacePythonSignal({
          body: {
            folderPath: nextRootPath,
          },
        } as Parameters<typeof getWorkspacePythonSignal>[0]),
      );
      if (!res200(response) || !response.data) {
        return null;
      }
      return response.data.hasPython;
    },
    ({ rootPath: nextRootPath }) => nextRootPath,
  ).then((hasPythonSignals) => {
    if (hasPythonSignals !== null) {
      setCachedWorkspacePythonSignal(
        cache,
        normalizedRootPath,
        hasPythonSignals,
      );
    }
    return hasPythonSignals;
  });
}
