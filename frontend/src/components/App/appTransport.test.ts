import { GoHTTPRouteHelpers } from "utils/generatedRoutes";
import { describe, expect, it } from "vitest";
import { buildAppBinaryDownloadUrl } from "./appTransport";

describe("appTransport", () => {
  it("builds the canonical app binary download URL", () => {
    const expectedPath = `/api${GoHTTPRouteHelpers.binaryDownload("content-a")}`;
    const url = new URL(buildAppBinaryDownloadUrl("content-a", null));

    expect(url.pathname).toBe(expectedPath);
    expect(url.search).toBe("");
  });

  it("preserves deployment share-session query binding on download URLs", () => {
    const url = new URL(
      buildAppBinaryDownloadUrl("content-a", "share-session-a"),
    );

    expect(url.searchParams.get("shareSessionId")).toBe("share-session-a");
  });
});
