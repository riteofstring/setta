import { C_ADDRESSES } from "utils/c_addresses";
import {
  GoRootRouteHelpers,
  GoWebsocketRouteHelpers,
} from "utils/generatedRoutes";
import { describe, expect, it } from "vitest";
import {
  buildBackendOriginURL,
  buildBackendOriginWebsocketURL,
} from "./backendOriginTransport";

describe("backendOriginTransport", () => {
  it("builds absolute backend-origin URLs", () => {
    expect(buildBackendOriginURL(GoRootRouteHelpers.bootstrapPage())).toBe(
      `${C_ADDRESSES.BACKEND_ORIGIN}${GoRootRouteHelpers.bootstrapPage()}`,
    );
  });

  it("builds backend-origin websocket URLs with query params", () => {
    const expectedPath = GoWebsocketRouteHelpers.frontend();
    const url = new URL(
      buildBackendOriginWebsocketURL(expectedPath, {
        shareSessionId: "share-a",
      }),
    );

    expect(url.pathname).toBe(expectedPath);
    expect(url.searchParams.get("shareSessionId")).toBe("share-a");
  });
});
