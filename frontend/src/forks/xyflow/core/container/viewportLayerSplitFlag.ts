import _ from "lodash";
import { useMemo } from "react";
import { useProjectState } from "state/definitions";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";

const VIEWPORT_LAYER_SPLIT_STORAGE_NAMESPACE = "viewport-layer-split";
export const VIEWPORT_LAYER_SPLIT_STORAGE_KEY =
  "setta.viewportLayerSplit.enabled";

export type ViewportLayerSplitFlagOverride = "enabled" | "disabled" | "unset";

export function parseViewportLayerSplitFlagOverride(
  rawValue: string | null,
): ViewportLayerSplitFlagOverride {
  if (!rawValue) {
    return "unset";
  }
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on") {
    return "enabled";
  }
  if (normalized === "0" || normalized === "false" || normalized === "off") {
    return "disabled";
  }
  return "unset";
}

export function readViewportLayerSplitFlagOverride(): ViewportLayerSplitFlagOverride {
  const storage = getSafeLocalStorageAdapter(VIEWPORT_LAYER_SPLIT_STORAGE_NAMESPACE);
  return parseViewportLayerSplitFlagOverride(
    storage.getItem(VIEWPORT_LAYER_SPLIT_STORAGE_KEY),
  );
}

export function isViewportLayerSplitScopeDefaultEnabled({
  projectName,
  activeViewModeName,
}: {
  projectName: string;
  activeViewModeName: string;
}): boolean {
  return (
    projectName.trim().toLowerCase() === "settings" &&
    activeViewModeName.trim() === "All Settings"
  );
}

export function useViewportLayerSplitEnabled(): boolean {
  const flagOverride = useMemo(readViewportLayerSplitFlagOverride, []);
  const { projectName, activeViewModeName } = useProjectState((state) => {
    const { activeViewModeId, viewModes } = state.projectConfig;
    const activeViewMode =
      activeViewModeId !== null ? viewModes[activeViewModeId] : null;
    return {
      projectName: state.projectConfig.name ?? "",
      activeViewModeName: activeViewMode?.name ?? "",
    };
  }, _.isEqual);

  if (flagOverride === "enabled") {
    return true;
  }
  if (flagOverride === "disabled") {
    return false;
  }

  return isViewportLayerSplitScopeDefaultEnabled({
    projectName,
    activeViewModeName,
  });
}
