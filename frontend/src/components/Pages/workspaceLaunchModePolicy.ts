import {
  modeSupportsWorkspaceLaunch as modeSupportsWorkspaceLaunchForMode,
  resolveWorkspaceLaunchRouteKind as resolveWorkspaceLaunchRouteKindForMode,
  type WorkspaceLaunchRouteKind,
} from "utils/serverModeBoundaryPolicy";
import type { ServerModeValue } from "./modeRouteResolver";

export function modeSupportsWorkspaceLaunch(mode: ServerModeValue): boolean {
  return modeSupportsWorkspaceLaunchForMode(mode);
}

export function resolveWorkspaceLaunchRouteKind(
  mode: ServerModeValue,
): WorkspaceLaunchRouteKind {
  return resolveWorkspaceLaunchRouteKindForMode(mode);
}
