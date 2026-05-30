export type WorkspaceCodeTokenRun = {
  line: number;
  fromColumn: number;
  toColumn: number;
  text: string;
  color: string;
  fontStyle?: "normal" | "italic";
  fontWeight?: "normal" | "bold";
};

export type WorkspaceCodeHighlightKeyParts = {
  sectionId: string;
  paramId: string;
  codeHash: string;
  language: string;
  themeRevision: string;
  fontRevision: string;
  highlighterRevision: string;
  previewWidth: number;
  previewLineLimit: number;
};

export type WorkspaceCodeHighlightCacheEntry =
  | {
      status: "pending";
      requestId: string;
      key: string;
    }
  | {
      status: "ready";
      requestId: string;
      key: string;
      tokenRuns: Array<WorkspaceCodeTokenRun>;
    };

export type WorkspaceCodeHighlightCacheState = {
  entriesByKey: Record<string, WorkspaceCodeHighlightCacheEntry>;
};

export function createWorkspaceCodeHighlightCacheState(): WorkspaceCodeHighlightCacheState {
  return { entriesByKey: {} };
}

export function hashWorkspaceCodePreviewValue(value: string): string {
  let hash = 2166136261;
  for (let idx = 0; idx < value.length; idx += 1) {
    hash ^= value.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildWorkspaceCodeHighlightCacheKey(
  parts: WorkspaceCodeHighlightKeyParts,
): string {
  return [
    "code-highlight",
    parts.sectionId,
    parts.paramId,
    parts.codeHash,
    parts.language,
    parts.themeRevision,
    parts.fontRevision,
    parts.highlighterRevision,
    String(Math.round(parts.previewWidth)),
    String(parts.previewLineLimit),
  ].join(":");
}

export function beginWorkspaceCodeHighlightRequest(
  cache: WorkspaceCodeHighlightCacheState,
  key: string,
  requestId: string,
): WorkspaceCodeHighlightCacheState {
  return {
    entriesByKey: {
      ...cache.entriesByKey,
      [key]: {
        status: "pending",
        requestId,
        key,
      },
    },
  };
}

export function getWorkspaceCodeHighlightCacheEntry(
  cache: WorkspaceCodeHighlightCacheState,
  key: string,
): WorkspaceCodeHighlightCacheEntry | null {
  return cache.entriesByKey[key] ?? null;
}

export function completeWorkspaceCodeHighlightRequest(
  cache: WorkspaceCodeHighlightCacheState,
  key: string,
  requestId: string,
  tokenRuns: Array<WorkspaceCodeTokenRun>,
): {
  cache: WorkspaceCodeHighlightCacheState;
  applied: boolean;
} {
  const entry = cache.entriesByKey[key];
  if (entry && (entry.requestId !== requestId || entry.status !== "pending")) {
    return { cache, applied: false };
  }
  return {
    applied: true,
    cache: {
      entriesByKey: {
        ...cache.entriesByKey,
        [key]: {
          status: "ready",
          requestId,
          key,
          tokenRuns,
        },
      },
    },
  };
}

export function getWorkspaceCodeHighlightTokenRuns(
  cache: WorkspaceCodeHighlightCacheState,
  key: string,
): Array<WorkspaceCodeTokenRun> | null {
  const entry = cache.entriesByKey[key];
  return entry?.status === "ready" ? entry.tokenRuns : null;
}
