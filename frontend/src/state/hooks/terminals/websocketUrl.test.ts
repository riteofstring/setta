import { replaceAddressParams } from "utils/endpointUtils";
import { GoRoutePrefixes, GoWebsocketRoutes } from "utils/generatedRoutes";
import { describe, expect, it } from "vitest";
import { buildTerminalWebsocketUrl } from "./websocketUrl";

describe("buildTerminalWebsocketUrl", () => {
  it("uses the Go websocket route for IDE terminal sessions", () => {
    // IDE terminal attach should hit the Go-owned websocket surface directly.
    const expectedPath = `${GoRoutePrefixes.api}${replaceAddressParams(
      GoWebsocketRoutes.terminalBySection,
      {
        projectID: "project-a",
        sectionID: "section-a",
      },
    )}`;
    const url = new URL(
      buildTerminalWebsocketUrl({
        projectConfigId: "project-a",
        sectionId: "section-a",
        shareSessionId: null,
      }),
    );

    expect(url.pathname).toBe(expectedPath);
    expect(url.search).toBe("");
  });

  it("uses the Go websocket route for deployment terminal sessions", () => {
    const expectedPath = `${GoRoutePrefixes.api}${replaceAddressParams(
      GoWebsocketRoutes.terminalBySection,
      {
        projectID: "project-a",
        sectionID: "section-a",
      },
    )}`;
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
