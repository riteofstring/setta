import type { GpuNodeVisualEffect } from "gpuFlow/gpuPipelines";

export const PROJECT_CANVAS_NODE_EFFECT_STORAGE_KEY = "settaCanvasNodeEffect";

const SHARED_CANVAS_EFFECT_STORAGE_KEY = "settaCanvasEffect";

const NODE_EFFECT_QUERY_KEYS = [
  "canvasNodeEffect",
  "settaCanvasNodeEffect",
] as const;
const SHARED_EFFECT_QUERY_KEYS = ["canvasEffect", "settaCanvasEffect"] as const;

const CLOTH_EFFECT_VALUES = new Set([
  "1",
  "cloth",
  "enabled",
  "on",
  "true",
  "wind",
  "yes",
]);
const DISABLED_EFFECT_VALUES = new Set([
  "0",
  "disabled",
  "false",
  "no",
  "none",
  "off",
]);

export function resolveProjectCanvasNodeEffectFromBrowser():
  | GpuNodeVisualEffect
  | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return resolveProjectCanvasNodeEffectFromValues({
    search: window.location.search,
    sharedStoredValue: window.localStorage.getItem(
      SHARED_CANVAS_EFFECT_STORAGE_KEY,
    ),
    storedValue: window.localStorage.getItem(
      PROJECT_CANVAS_NODE_EFFECT_STORAGE_KEY,
    ),
  });
}

export function resolveProjectCanvasNodeEffectFromValues({
  search,
  sharedStoredValue,
  storedValue,
}: {
  readonly search: string;
  readonly sharedStoredValue?: string | null | undefined;
  readonly storedValue?: string | null | undefined;
}): GpuNodeVisualEffect | undefined {
  const queryEffect = resolveProjectCanvasNodeEffectFromSearch(search);
  if (queryEffect !== null) {
    return queryEffect;
  }
  return (
    resolveProjectCanvasNodeEffectValue(storedValue) ??
    resolveProjectCanvasNodeEffectValue(sharedStoredValue) ??
    undefined
  );
}

function resolveProjectCanvasNodeEffectFromSearch(
  search: string,
): GpuNodeVisualEffect | undefined | null {
  const params = new URLSearchParams(search);
  for (const key of NODE_EFFECT_QUERY_KEYS) {
    if (!params.has(key)) {
      continue;
    }
    return resolveProjectCanvasNodeEffectValue(params.get(key) || "cloth");
  }
  for (const key of SHARED_EFFECT_QUERY_KEYS) {
    if (!params.has(key)) {
      continue;
    }
    return resolveProjectCanvasNodeEffectValue(params.get(key));
  }
  return null;
}

function resolveProjectCanvasNodeEffectValue(
  value: string | null | undefined,
): GpuNodeVisualEffect | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || DISABLED_EFFECT_VALUES.has(normalized)) {
    return undefined;
  }
  return CLOTH_EFFECT_VALUES.has(normalized) ? "cloth" : undefined;
}
