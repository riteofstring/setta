import { useWebsocketConnectionList } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { ConnectionTypeEnum, createConnection } from "utils/generatedTypes";
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
      createConnection({
        id: "main",
        connectionType: ConnectionTypeEnum.SERVER,
        currentAddress: "/project",
      }),
    );

    setWebsocketConnections([
      createConnection({
        id: "frontend-1",
        connectionType: ConnectionTypeEnum.frontend,
        currentAddress: "/project",
      }),
    ]);

    expect(useWebsocketConnectionList.getState().connections).toEqual([
      createConnection({
        id: "main",
        connectionType: ConnectionTypeEnum.SERVER,
        currentAddress: "/project",
      }),
      createConnection({
        id: "frontend-1",
        connectionType: ConnectionTypeEnum.frontend,
        currentAddress: "/project",
      }),
    ]);
  });
});
