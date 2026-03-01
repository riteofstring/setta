import { useMemo } from "react";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";

const VIEWPORT_LAYER_SPLIT_STORAGE_NAMESPACE = "viewport-layer-split";
export const VIEWPORT_LAYER_SPLIT_STORAGE_KEY =
  "setta.viewportLayerSplit.enabled";

export function isViewportLayerSplitFlagEnabled(rawValue: string | null): boolean {
  if (!rawValue) {
    return false;
  }
  const normalized = rawValue.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
}

export function readViewportLayerSplitFlag(): boolean {
  const storage = getSafeLocalStorageAdapter(VIEWPORT_LAYER_SPLIT_STORAGE_NAMESPACE);
  return isViewportLayerSplitFlagEnabled(
    storage.getItem(VIEWPORT_LAYER_SPLIT_STORAGE_KEY),
  );
}

export function useViewportLayerSplitEnabled(): boolean {
  return useMemo(readViewportLayerSplitFlag, []);
}
