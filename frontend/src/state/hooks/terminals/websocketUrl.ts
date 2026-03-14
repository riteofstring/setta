import { C_ADDRESSES } from "utils/c_addresses";
import { replaceAddressParams } from "utils/endpointUtils";
import { GoWebsocketRoutes } from "utils/generatedRoutes";

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
  const routePath = replaceAddressParams(GoWebsocketRoutes.terminalBySection, {
    projectID: projectConfigId,
    sectionID: sectionId,
  });

  const url = new URL(`${C_ADDRESSES.WEBSOCKET}${routePath}`);
  if (shareSessionId) {
    url.searchParams.set("shareSessionId", shareSessionId);
  }
  return url.toString();
}
