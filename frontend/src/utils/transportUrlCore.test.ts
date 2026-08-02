import { beforeEach, describe, expect, it } from "vitest";

import { C_ADDRESSES } from "@setta/app-subsystem-frontend-sdk";
import { useServerMode } from "state/definitions";
import { TransportRouteConstants } from "./generatedTypes";
import {
  ROOT_TRANSPORT_ROUTES,
  WEBSOCKET_TRANSPORT_ROUTES,
} from "./transportRouteConstants";
import {
  buildBackendOriginWebsocketURL,
  buildBackendURL,
} from "./transportUrlCore";

describe("transportUrlCore", () => {
  beforeEach(() => {
    useServerMode.setState({
      mode: null,
      modeResolved: true,
      modeError: null,
    });
  });

  it("routes launcher-scoped HTTP routes through launcher origin in launcher mode", () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });

    const url = new URL(
      buildBackendURL(
        TransportRouteConstants.serverModeBoundary.getLauncherRecentWorkspaces,
      ),
    );

    expect(url.origin).toBe(new URL(C_ADDRESSES.LAUNCHER).origin);
    expect(url.pathname).toBe("/api/launcherRecentWorkspaces");
  });

  it("routes backend-origin websocket URLs without the /api prefix", () => {
    const websocketUrl = new URL(
      buildBackendOriginWebsocketURL(WEBSOCKET_TRANSPORT_ROUTES.frontend, {
        shareSessionId: "share-session-a",
      }),
    );
    const bootstrapUrl = new URL(
      buildBackendURL(ROOT_TRANSPORT_ROUTES.toolsCall),
    );

    expect(websocketUrl.pathname).toBe(WEBSOCKET_TRANSPORT_ROUTES.frontend);
    expect(websocketUrl.searchParams.get("shareSessionId")).toBe(
      "share-session-a",
    );
    expect(bootstrapUrl.pathname).toBe(ROOT_TRANSPORT_ROUTES.toolsCall);
  });
});
