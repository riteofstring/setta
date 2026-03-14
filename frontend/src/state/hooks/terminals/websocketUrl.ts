import { C_ADDRESSES } from "utils/c_addresses";
import { GoWebsocketRouteHelpers } from "utils/generatedRoutes";

export type BuildTerminalWebsocketUrlOptions = {
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
};

export function buildTerminalWebsocketUrl({
  projectConfigId,
  sectionId,
  shareSessionId,
}: BuildTerminalWebsocketUrlOptions): string {
  const routePath = GoWebsocketRouteHelpers.terminalBySection(
    projectConfigId,
    sectionId,
  );

  const url = new URL(`${C_ADDRESSES.WEBSOCKET}${routePath}`);
  if (shareSessionId) {
    url.searchParams.set("shareSessionId", shareSessionId);
  }
  return url.toString();
}
