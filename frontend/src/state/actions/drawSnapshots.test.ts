import { createContentRef } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectDrawSnapshotPayloads,
  registerDrawSnapshotProvider,
  unregisterDrawSnapshotProvider,
} from "./drawSnapshots";

vi.mock("utils/generatedEndpoints", () => ({
  route_binary_upload: vi.fn(),
}));

describe("collectDrawSnapshotPayloads", () => {
  const sectionIds = ["draw-a", "draw-b", "draw-missing"] as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const sectionId of sectionIds) {
      unregisterDrawSnapshotProvider(sectionId);
    }
  });

  it("uploads each available draw snapshot and returns refs keyed by section id", async () => {
    const { route_binary_upload } = await import("utils/generatedEndpoints");

    // Multiple draw areas should upload independently and preserve their
    // section-to-content-id mapping in the returned payload object.
    vi.mocked(route_binary_upload)
      .mockResolvedValueOnce({
        data: createContentRef({
          contentId: "content-a",
          byteLength: 4,
          mimeType: "image/png",
          sha256: null,
        }),
        status: 200,
        hasResponse: true,
      })
      .mockResolvedValueOnce({
        data: createContentRef({
          contentId: "content-b",
          byteLength: 6,
          mimeType: "image/png",
          sha256: null,
        }),
        status: 200,
        hasResponse: true,
      });

    registerDrawSnapshotProvider("draw-a", () => new Blob(["aaaa"]));
    registerDrawSnapshotProvider("draw-b", () => new Blob(["bbbbbb"]));

    const payloads = await collectDrawSnapshotPayloads([
      "draw-a",
      "draw-b",
      "draw-missing",
    ]);

    expect(route_binary_upload).toHaveBeenCalledTimes(2);
    expect(payloads).toEqual({
      "draw-a": createContentRef({
        contentId: "content-a",
        byteLength: 4,
        mimeType: "image/png",
        sha256: null,
      }),
      "draw-b": createContentRef({
        contentId: "content-b",
        byteLength: 6,
        mimeType: "image/png",
        sha256: null,
      }),
    });
  });

  it("returns null when uploads fail or no provider yields a blob", async () => {
    const { route_binary_upload } = await import("utils/generatedEndpoints");

    // Failed uploads should be dropped from the result, and an all-empty run
    // should collapse to null instead of returning an empty object.
    vi.mocked(route_binary_upload).mockResolvedValue({
      data: { detail: "too large" },
      status: 413,
      hasResponse: true,
    });

    registerDrawSnapshotProvider("draw-a", () => new Blob(["aaaa"]));
    registerDrawSnapshotProvider("draw-b", () => null);

    const payloads = await collectDrawSnapshotPayloads([
      "draw-a",
      "draw-b",
      "draw-missing",
    ]);

    expect(route_binary_upload).toHaveBeenCalledTimes(1);
    expect(payloads).toBeNull();
  });
});
