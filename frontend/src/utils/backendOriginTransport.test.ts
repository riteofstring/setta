import { GoWebsocketRouteHelpers } from "utils/generatedRoutes";
import { describe, expect, it } from "vitest";
import {
  buildListenerWebsocketUrl,
  buildTerminalWebsocketUrl,
} from "./backendOriginTransport";

describe("backendOriginTransport", () => {
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
