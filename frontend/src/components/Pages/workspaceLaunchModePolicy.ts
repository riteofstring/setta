import type { ServerModeValue } from "./modeRouteResolver";

export function modeSupportsWorkspaceLaunch(mode: ServerModeValue): boolean {
  return mode === "ide" || mode === "launcher";
}

export type WorkspaceLaunchRouteKind = "ide" | "launcher" | "blocked";

export function resolveWorkspaceLaunchRouteKind(
  mode: ServerModeValue,
): WorkspaceLaunchRouteKind {
  if (!modeSupportsWorkspaceLaunch(mode)) {
    return "blocked";
  }
  if (mode === "launcher") {
    return "launcher";
  }
  return "ide";
}
