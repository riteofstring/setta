import { dedupeInFlightJson } from "utils/dedupeInFlight";
import { route_get_folder_contents } from "utils/generatedEndpoints";
import type { FolderContentItem } from "utils/generatedTypes";

type WorkspaceRootEntry = Pick<FolderContentItem, "name" | "type">;

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

const PYTHON_ROOT_MARKER_FILES = new Set<string>([
  "pyproject.toml",
  "requirements.txt",
  "requirements-dev.txt",
  "setup.py",
  "setup.cfg",
  "pipfile",
  "tox.ini",
  "poetry.lock",
  "uv.lock",
]);

export function hasPythonSignalsInRoot(entries: WorkspaceRootEntry[]): boolean {
  for (const entry of entries) {
    if (entry.type !== "file") {
      continue;
    }
    const lowerName = entry.name.toLowerCase();
    if (lowerName.endsWith(".py")) {
      return true;
    }
    if (PYTHON_ROOT_MARKER_FILES.has(lowerName)) {
      return true;
    }
  }
  return false;
}

export function getCachedWorkspacePythonSignal(
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

export function setCachedWorkspacePythonSignal(
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
      try {
        const contentsResponse = await route_get_folder_contents({
          folderPath: nextRootPath,
          includeMtime: false,
          includeSize: false,
          maxEntries: 5000,
        });
        if (
          !contentsResponse ||
          contentsResponse.status !== 200 ||
          !Array.isArray(contentsResponse.data)
        ) {
          return null;
        }
        return hasPythonSignalsInRoot(contentsResponse.data);
      } catch {
        return null;
      }
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
