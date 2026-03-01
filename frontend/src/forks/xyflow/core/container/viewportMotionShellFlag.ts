import { useMemo } from "react";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";

const VIEWPORT_MOTION_SHELL_STORAGE_NAMESPACE = "viewport-motion-shell";
export const VIEWPORT_MOTION_SHELL_STORAGE_KEY =
  "setta.viewportMotionShell.enabled";

export type ViewportMotionShellFlagOverride = "enabled" | "disabled" | "unset";

export function parseViewportMotionShellFlagOverride(
  rawValue: string | null,
): ViewportMotionShellFlagOverride {
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

export function readViewportMotionShellFlagOverride(): ViewportMotionShellFlagOverride {
  const storage = getSafeLocalStorageAdapter(
    VIEWPORT_MOTION_SHELL_STORAGE_NAMESPACE,
  );
  return parseViewportMotionShellFlagOverride(
    storage.getItem(VIEWPORT_MOTION_SHELL_STORAGE_KEY),
  );
}

export function resolveViewportMotionShellEnabled(
  flagOverride: ViewportMotionShellFlagOverride,
): boolean {
  return flagOverride === "enabled";
}

export function useViewportMotionShellEnabled(): boolean {
  const flagOverride = useMemo(readViewportMotionShellFlagOverride, []);
  return resolveViewportMotionShellEnabled(flagOverride);
}
