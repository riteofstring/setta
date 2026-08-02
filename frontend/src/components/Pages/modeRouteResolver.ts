import type { ReactNode } from "react";
import type { ServerModeValue } from "utils/serverModeTypes";

export type ModeRouteElements = {
  ide: ReactNode;
  share: ReactNode;
  app: ReactNode;
  launcher: ReactNode;
};

export function resolveModeElementForServerMode(
  mode: ServerModeValue,
  routes: ModeRouteElements,
): ReactNode {
  if (mode === "share") {
    return routes.share;
  }
  if (mode === "app") {
    return routes.app;
  }
  if (mode === "launcher") {
    return routes.launcher;
  }
  return routes.ide;
}
