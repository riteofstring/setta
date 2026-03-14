import { C_ADDRESSES } from "utils/c_addresses";
import {
  GoRootRouteHelpers,
  GoWebsocketRouteHelpers,
} from "utils/generatedRoutes";
import { describe, expect, it } from "vitest";
import {
  buildBackendOriginURL,
  buildBackendOriginWebsocketURL,
  buildBootstrapPageUrl,
  buildFrontendWebsocketUrl,
  buildListenerWebsocketUrl,
  buildTerminalWebsocketUrl,
  getFrontendWebsocketRoute,
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

  it("builds the bootstrap page URL from the canonical root route helper", () => {
    expect(buildBootstrapPageUrl()).toBe(
      `${C_ADDRESSES.BACKEND_ORIGIN}${GoRootRouteHelpers.bootstrapPage()}`,
    );
  });

  it("exposes the canonical frontend websocket route and URL helper", () => {
    const expectedPath = GoWebsocketRouteHelpers.frontend();

    expect(getFrontendWebsocketRoute()).toBe(expectedPath);
    expect(new URL(buildFrontendWebsocketUrl("share-a")).pathname).toBe(
      expectedPath,
    );
  });

  it("builds listener websocket URLs from the canonical Go websocket helper", () => {
    const expectedPath = GoWebsocketRouteHelpers.listenerById("listener-a");
    const url = new URL(
      buildListenerWebsocketUrl({
        listenerId: "listener-a",
        projectConfigId: "project-a",
        shareSessionId: "share-a",
      }),
    );

    expect(url.pathname).toBe(expectedPath);
    expect(url.searchParams.get("projectId")).toBe("project-a");
    expect(url.searchParams.get("shareSessionId")).toBe("share-a");
  });

  it("builds terminal websocket URLs from the canonical Go websocket helper", () => {
    const expectedPath = GoWebsocketRouteHelpers.terminalBySection(
      "project-a",
      "section-a",
    );
    const url = new URL(
      buildTerminalWebsocketUrl({
        projectConfigId: "project-a",
        sectionId: "section-a",
        shareSessionId: "share-a",
      }),
    );

    expect(url.pathname).toBe(expectedPath);
    expect(url.searchParams.get("shareSessionId")).toBe("share-a");
  });
});
