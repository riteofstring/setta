import { useWebsocketConnectionList } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  WebsocketConnectionTypeEnum,
  createWebsocketConnectionInfo,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it } from "vitest";
import {
  addWebsocketConnection,
  setWebsocketConnections,
} from "./websocketConnectionList";

describe("websocketConnectionList", () => {
  afterEach(() => {
    resetProjectStores();
  });

  it("preserves active local server connections when backend snapshots arrive", () => {
    // The header uses a local SERVER marker to reflect websocket transport health.
    addWebsocketConnection(
      createWebsocketConnectionInfo({
        id: "main",
        connectionType: WebsocketConnectionTypeEnum.SERVER,
        currentAddress: "/project",
      }),
    );

    setWebsocketConnections([
      createWebsocketConnectionInfo({
        id: "frontend-1",
        connectionType: WebsocketConnectionTypeEnum.FRONTEND,
        currentAddress: "/project",
      }),
    ]);

    expect(useWebsocketConnectionList.getState().connections).toEqual([
      createWebsocketConnectionInfo({
        id: "main",
        connectionType: WebsocketConnectionTypeEnum.SERVER,
        currentAddress: "/project",
      }),
      createWebsocketConnectionInfo({
        id: "frontend-1",
        connectionType: WebsocketConnectionTypeEnum.FRONTEND,
        currentAddress: "/project",
      }),
    ]);
  });
});
