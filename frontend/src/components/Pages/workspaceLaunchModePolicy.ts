import type { ServerModeValue } from "./modeRouteResolver";

export function modeSupportsWorkspaceLaunch(mode: ServerModeValue): boolean {
  return mode === "ide" || mode === "launcher";
}
