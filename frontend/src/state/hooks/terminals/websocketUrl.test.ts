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
      }),
    );

    expect(url.pathname).toBe("/api/ws/terminals/project-a/section-a");
    expect(url.search).toBe("");
  });

  it("uses the Go websocket route for deployment terminal sessions", () => {
    const url = new URL(
      buildTerminalWebsocketUrl({
        projectConfigId: "project-a",
        sectionId: "section-a",
        shareSessionId: "share-a",
      }),
    );

    expect(url.pathname).toBe("/api/ws/terminals/project-a/section-a");
    expect(url.searchParams.get("shareSessionId")).toBe("share-a");
  });
});
