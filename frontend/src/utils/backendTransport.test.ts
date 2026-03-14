import { GoHTTPRouteHelpers } from "utils/generatedRoutes";
import { describe, expect, it } from "vitest";
import { buildBackendURL } from "./backendTransport";

describe("backendTransport", () => {
  it("builds canonical backend URLs", () => {
    const expectedPath = `/api${GoHTTPRouteHelpers.binaryDownload("content-a")}`;
    const url = new URL(
      buildBackendURL(GoHTTPRouteHelpers.binaryDownload("content-a")),
    );

    expect(url.pathname).toBe(expectedPath);
  });

  it("preserves query params on canonical backend URLs", () => {
    const url = new URL(
      buildBackendURL("/binary/content-a", {
        shareSessionId: "share-session-a",
      }),
    );

    expect(url.searchParams.get("shareSessionId")).toBe("share-session-a");
  });
});
