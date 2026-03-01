import { useMemo } from "react";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";

const VIEWPORT_SHELL_MODE_STORAGE_NAMESPACE = "viewport-shell-mode";
export const VIEWPORT_SHELL_MODE_STORAGE_KEY =
  "setta.viewportShellMode.enabled";

export type ViewportShellModeFlagOverride = "enabled" | "disabled" | "unset";

export function parseViewportShellModeFlagOverride(
  rawValue: string | null,
): ViewportShellModeFlagOverride {
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

export function readViewportShellModeFlagOverride(): ViewportShellModeFlagOverride {
  const storage = getSafeLocalStorageAdapter(
    VIEWPORT_SHELL_MODE_STORAGE_NAMESPACE,
  );
  return parseViewportShellModeFlagOverride(
    storage.getItem(VIEWPORT_SHELL_MODE_STORAGE_KEY),
  );
}

export function resolveViewportShellModeEnabled(
  flagOverride: ViewportShellModeFlagOverride,
): boolean {
  return flagOverride === "enabled";
}

export function useViewportShellModeEnabled(): boolean {
  const flagOverride = useMemo(readViewportShellModeFlagOverride, []);
  return resolveViewportShellModeEnabled(flagOverride);
}
