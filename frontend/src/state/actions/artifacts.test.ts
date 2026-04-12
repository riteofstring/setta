/* @vitest-environment jsdom */

import {
  useBrushStrokes,
  useChartData,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createBrushStrokeArtifact,
  createChartDataArtifact,
  createContentRef,
  createDrawAreaLayerItemTransformArtifact,
  createImageArtifact,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateArtifacts } from "./artifacts";

const { updateArtifactsApiMock, addTemporaryNotificationMock } = vi.hoisted(
  () => ({
    updateArtifactsApiMock: vi.fn(),
    addTemporaryNotificationMock: vi.fn(),
  }),
);

vi.mock("openapi/http", () => ({
  updateArtifacts: updateArtifactsApiMock,
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

describe("updateArtifacts", () => {
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
      writable: true,
    });
  });

  afterEach(() => {
    resetProjectStores();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
      writable: true,
    });
  });

  it("routes each artifact type into its authoritative store", () => {
    const imageArtifact = createImageArtifact({
      id: "image-1",
      value: createContentRef({
        contentId: "content-1",
        byteLength: 4,
        mimeType: "image/png",
        sha256: null,
      }),
    });
    const brushStrokeArtifact = createBrushStrokeArtifact({
      id: "stroke-1",
    });
    const transformArtifact = createDrawAreaLayerItemTransformArtifact({
      id: "transform-1",
      value: {
        eraserStrokes: ["stroke-1"],
        transform: [1, 0, 0, 1, 5, 8],
      },
    });
    const chartDataArtifact = createChartDataArtifact({
      id: "chart-1",
      value: { x: [1, 2], y: [3, 4] },
    });

    updateArtifacts({
      artifacts: [
        imageArtifact,
        brushStrokeArtifact,
        transformArtifact,
        chartDataArtifact,
      ],
      updateType: "update",
    });

    expect(useImages.getState().x).toEqual({
      [imageArtifact.id]: imageArtifact,
    });
    expect(useBrushStrokes.getState().x).toEqual({
      [brushStrokeArtifact.id]: brushStrokeArtifact,
    });
    expect(useDrawAreaLayerItemTransform.getState().x).toEqual({
      [transformArtifact.id]: transformArtifact,
    });
    expect(useChartData.getState().x).toEqual({
      [chartDataArtifact.id]: chartDataArtifact,
    });
    expect(useImages.getState().revisionById).toEqual({
      [imageArtifact.id]: 1,
    });
    expect(useBrushStrokes.getState().revisionById).toEqual({
      [brushStrokeArtifact.id]: 1,
    });
    expect(useDrawAreaLayerItemTransform.getState().revisionById).toEqual({
      [transformArtifact.id]: 1,
    });
    expect(useChartData.getState().revisionById).toEqual({
      [chartDataArtifact.id]: 1,
    });
  });

  it("removes decoded image cache entries when image artifacts are deleted", () => {
    const imageArtifact = createImageArtifact({
      id: "image-to-delete",
      value: createContentRef({
        contentId: "content-delete",
        byteLength: 6,
        mimeType: "image/png",
        sha256: null,
      }),
    });
    const decodedImage = document.createElement("img");
    decodedImage.dataset.objectUrl = "blob:image-to-delete";

    useImages.setState((state) => ({
      ...state,
      x: { [imageArtifact.id]: imageArtifact },
      revisionById: { [imageArtifact.id]: 3 },
      localRevisionById: { [imageArtifact.id]: { local: 1 } },
    }));
    useDecodedImages.setState((state) => ({
      ...state,
      x: { [imageArtifact.id]: decodedImage },
      revisionById: { [imageArtifact.id]: 5 },
      localRevisionById: { [imageArtifact.id]: { local: 2 } },
    }));

    updateArtifacts({
      artifacts: [imageArtifact],
      updateType: "delete",
    });

    expect(useImages.getState().x).toEqual({});
    expect(useImages.getState().revisionById).toEqual({});
    expect(useImages.getState().localRevisionById).toEqual({});
    expect(useDecodedImages.getState().x).toEqual({});
    expect(useDecodedImages.getState().revisionById).toEqual({});
    expect(useDecodedImages.getState().localRevisionById).toEqual({});
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:image-to-delete");
  });
});
