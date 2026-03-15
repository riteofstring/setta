import { beforeEach, describe, expect, it } from "vitest";

import { useServerMode } from "state/definitions";
import {
  GoHTTPRouteHelpers,
  GoRootRouteHelpers,
  GoWebsocketRouteHelpers,
} from "utils/generatedRoutes";
import { C_ADDRESSES } from "./c_addresses";
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
      buildBackendURL(GoHTTPRouteHelpers.getLauncherRecentWorkspaces()),
    );

    expect(url.origin).toBe(new URL(C_ADDRESSES.LAUNCHER).origin);
    expect(url.pathname).toBe("/api/launcherRecentWorkspaces");
  });

  it("routes backend-origin websocket URLs without the /api prefix", () => {
    const websocketUrl = new URL(
      buildBackendOriginWebsocketURL(GoWebsocketRouteHelpers.frontend(), {
        shareSessionId: "share-session-a",
      }),
    );
    const bootstrapUrl = new URL(
      buildBackendURL(GoRootRouteHelpers.toolsCall()),
    );

    expect(websocketUrl.pathname).toBe(GoWebsocketRouteHelpers.frontend());
    expect(websocketUrl.searchParams.get("shareSessionId")).toBe(
      "share-session-a",
    );
    expect(bootstrapUrl.pathname).toBe(GoRootRouteHelpers.toolsCall());
  });
});
