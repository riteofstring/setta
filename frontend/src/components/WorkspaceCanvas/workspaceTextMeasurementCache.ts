export type WorkspaceTextStyleKey =
  | "section-title"
  | "dict-label"
  | "dict-value"
  | "dict-control";

export const WORKSPACE_TEXT_STYLES = {
  "section-title":
    "700 11.2px ui-sans-serif, system-ui, sans-serif",
  "dict-label":
    "600 12px ui-sans-serif, system-ui, sans-serif",
  "dict-value":
    '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  "dict-control":
    "11px ui-sans-serif, system-ui, sans-serif",
} satisfies Record<WorkspaceTextStyleKey, string>;

export type WorkspaceTextMeasurementRequest = {
  cacheKey: string;
  text: string;
  font: string;
  maxWidth: number;
};

export type WorkspaceTextMeasurementResult = {
  measuredWidth: number;
  displayText: string;
  displayWidth: number;
  truncated: boolean;
};

export type WorkspaceTextPreview = WorkspaceTextMeasurementRequest &
  WorkspaceTextMeasurementResult & {
    ready: boolean;
  };

export type WorkspaceTextMeasurementKeyParts = {
  baseKey: string;
  role: WorkspaceTextStyleKey;
  text: string;
  font: string;
  maxWidth: number;
};

export type WorkspaceTextMeasurementCacheEntry =
  | {
      status: "pending";
      requestId: string;
      key: string;
    }
  | {
      status: "ready";
      requestId: string;
      key: string;
      result: WorkspaceTextMeasurementResult;
    };

export type WorkspaceTextMeasurementCacheState = {
  entriesByKey: Record<string, WorkspaceTextMeasurementCacheEntry>;
};

export function createWorkspaceTextMeasurementCacheState(): WorkspaceTextMeasurementCacheState {
  return { entriesByKey: {} };
}

export function buildWorkspaceTextMeasurementCacheKey(
  parts: WorkspaceTextMeasurementKeyParts,
): string {
  return [
    "text-measure",
    parts.baseKey,
    parts.role,
    String(Math.round(parts.maxWidth)),
    parts.font,
    parts.text,
  ].join(":");
}

export function beginWorkspaceTextMeasurementRequest(
  cache: WorkspaceTextMeasurementCacheState,
  key: string,
  requestId: string,
): WorkspaceTextMeasurementCacheState {
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

export function getWorkspaceTextMeasurementCacheEntry(
  cache: WorkspaceTextMeasurementCacheState,
  key: string,
): WorkspaceTextMeasurementCacheEntry | null {
  return cache.entriesByKey[key] ?? null;
}

export function completeWorkspaceTextMeasurementRequest(
  cache: WorkspaceTextMeasurementCacheState,
  key: string,
  requestId: string,
  result: WorkspaceTextMeasurementResult,
): {
  cache: WorkspaceTextMeasurementCacheState;
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
          result,
        },
      },
    },
  };
}

export function resolveWorkspaceTextPreview(
  cache: WorkspaceTextMeasurementCacheState | undefined,
  request: WorkspaceTextMeasurementRequest,
): WorkspaceTextPreview {
  const entry = cache?.entriesByKey[request.cacheKey];
  if (entry?.status === "ready") {
    return {
      ...request,
      ...entry.result,
      ready: true,
    };
  }
  return {
    ...request,
    measuredWidth: 0,
    displayText: request.text,
    displayWidth: 0,
    truncated: false,
    ready: false,
  };
}

export function measureWorkspaceTextPreview(
  context: CanvasRenderingContext2D,
  request: WorkspaceTextMeasurementRequest,
): WorkspaceTextMeasurementResult {
  const previousFont = context.font;
  context.font = request.font;
  const normalizedMaxWidth = Math.max(0, request.maxWidth);
  const measuredWidth = context.measureText(request.text).width;
  const displayText =
    measuredWidth <= normalizedMaxWidth
      ? request.text
      : truncateWorkspaceText(context, request.text, normalizedMaxWidth);
  const displayWidth = context.measureText(displayText).width;
  context.font = previousFont;
  return {
    measuredWidth,
    displayText,
    displayWidth,
    truncated: displayText !== request.text,
  };
}

function truncateWorkspaceText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  if (maxWidth <= 0 || text.length === 0) {
    return "";
  }
  const suffix = "\u2026";
  const suffixWidth = context.measureText(suffix).width;
  if (suffixWidth > maxWidth) {
    return "";
  }
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid)}${suffix}`;
    if (context.measureText(candidate).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${text.slice(0, low)}${suffix}`;
}
