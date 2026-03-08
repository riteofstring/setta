import { describe, expect, it } from "vitest";
import { buildTerminalWebsocketUrl } from "./websocketUrl";

describe("buildTerminalWebsocketUrl", () => {
  it("uses the Go websocket route for IDE terminal sessions", () => {
    // IDE terminal attach should hit the Go-owned websocket surface directly.
    const url = new URL(
      buildTerminalWebsocketUrl({
        projectConfigId: "project-a",
        sectionId: "section-a",
        shareSessionId: null,
        isDeploymentMode: false,
      }),
    );

    expect(url.pathname).toBe("/api/ws/terminals/project-a/section-a");
    expect(url.search).toBe("");
  });

  it("keeps the legacy websocket route for deployment terminal sessions", () => {
    // Deployment/share terminal transport remains on the legacy route until the
    // Go share-policy boundary is explicitly reopened.
    const url = new URL(
      buildTerminalWebsocketUrl({
        projectConfigId: "project-a",
        sectionId: "section-a",
        shareSessionId: "share-a",
        isDeploymentMode: true,
        legacyClientID: "client-a",
      }),
    );

    expect(url.pathname).toBe("/api/project-a/section-a/client-a");
    expect(url.searchParams.get("shareSessionId")).toBe("share-a");
  });
});
