import { GoHTTPRouteHelpers } from "utils/generatedRoutes";
import { describe, expect, it } from "vitest";
import { buildBinaryDownloadUrl } from "./backendTransport";

describe("backendTransport", () => {
  it("builds canonical binary-download URLs", () => {
    const expectedPath = `/api${GoHTTPRouteHelpers.binaryDownload("content-a")}`;
    const url = new URL(buildBinaryDownloadUrl("content-a", "share-a"));

    expect(url.pathname).toBe(expectedPath);
    expect(url.searchParams.get("shareSessionId")).toBe("share-a");
  });
});
