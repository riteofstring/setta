/* @vitest-environment jsdom */

import { blobToImageObj } from "components/Section/Layouts/DrawArea/binaryConversion";
import { useDecodedImages, useImages } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { ArtifactTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decodeExistingRawImages } from "./artifactTransport";

vi.mock("components/Section/Layouts/DrawArea/binaryConversion", async () => {
  const actual = await vi.importActual<
    typeof import("components/Section/Layouts/DrawArea/binaryConversion")
  >("components/Section/Layouts/DrawArea/binaryConversion");
  return {
    ...actual,
    blobToImageObj: vi.fn(),
  };
});

const mockedBlobToImageObj = vi.mocked(blobToImageObj);

describe("artifactTransport", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "revokeObjectURL");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetProjectStores();
  });

  it("decodes raw image artifacts into the decoded-image store", async () => {
    const imageArtifact = {
      type: ArtifactTypeEnum.Image,
      id: "image-1",
      value: {
        contentId: "content-1",
        byteLength: 42,
        mimeType: "image/png",
        sha256: null,
      },
    };
    useImages.setState({
      x: { [imageArtifact.id]: imageArtifact },
      revisionById: {},
      localRevisionById: {},
    });
    const responseBlob = new Blob(["png-bytes"], { type: "image/png" });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => responseBlob,
    });
    vi.stubGlobal("fetch", fetchImpl);
    const decodedImage = document.createElement("img");
    decodedImage.dataset.objectUrl = "blob:new-image";
    mockedBlobToImageObj.mockResolvedValue(decodedImage);

    await decodeExistingRawImages([imageArtifact.id]);

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("content-1")),
      {
        credentials: "include",
        headers: {},
      },
    );
    expect(useDecodedImages.getState().x[imageArtifact.id]).toBe(decodedImage);
    expect(decodedImage.dataset.contentId).toBe("content-1");
    expect(useDecodedImages.getState().revisionById[imageArtifact.id]).toBe(1);
  });

  it("revokes replaced decoded-image object urls before storing the new image", async () => {
    const imageArtifact = {
      type: ArtifactTypeEnum.Image,
      id: "image-1",
      value: {
        contentId: "content-2",
        byteLength: 84,
        mimeType: "image/png",
        sha256: null,
      },
    };
    const previousDecodedImage = document.createElement("img");
    previousDecodedImage.dataset.objectUrl = "blob:old-image";
    previousDecodedImage.dataset.contentId = "content-1";
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    useImages.setState({
      x: { [imageArtifact.id]: imageArtifact },
      revisionById: {},
      localRevisionById: {},
    });
    useDecodedImages.setState({
      x: { [imageArtifact.id]: previousDecodedImage },
      revisionById: { [imageArtifact.id]: 1 },
      localRevisionById: {},
    });
    const responseBlob = new Blob(["png-bytes"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => responseBlob,
      }),
    );
    const decodedImage = document.createElement("img");
    decodedImage.dataset.objectUrl = "blob:new-image";
    mockedBlobToImageObj.mockResolvedValue(decodedImage);

    await decodeExistingRawImages([imageArtifact.id]);

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:old-image");
    expect(useDecodedImages.getState().x[imageArtifact.id]).toBe(decodedImage);
    expect(decodedImage.dataset.contentId).toBe("content-2");
  });
});
