// @vitest-environment jsdom

import {
  useBrushStrokes,
  useChartData,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ArtifactTypeEnum,
  DrawAreaBrushShapeEnum,
  createBrushStroke,
  createBrushStrokeArtifact,
  createDrawAreaLayerItemTransform,
  createDrawAreaLayerItemTransformArtifact,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { updateArtifacts } from "./artifactStoreUpdates";

describe("artifactStoreUpdates", () => {
  afterEach(() => {
    Reflect.deleteProperty(URL, "revokeObjectURL");
    vi.restoreAllMocks();
    resetProjectStores();
  });

  it("routes websocket artifact updates into the artifact stores by type", () => {
    // Incoming artifact snapshots should land in the matching Zustand store without reshaping.
    const imageArtifact = {
      type: ArtifactTypeEnum.Image,
      id: "image-1",
      value: {
        contentId: "content-1",
        byteLength: 42,
        mimeType: "image/png",
        sha256: "sha-1",
      },
    };
    const brushStrokeArtifact = createBrushStrokeArtifact({
      id: "stroke-1",
      value: createBrushStroke({
        strokeStyle: "#fff",
        lineWidth: 3,
        lineCap: DrawAreaBrushShapeEnum.round,
        points: [
          [0, 0],
          [12, 18],
        ],
      }),
    });
    const transformArtifact = createDrawAreaLayerItemTransformArtifact({
      id: "transform-1",
      value: createDrawAreaLayerItemTransform({
        transform: [1, 0, 0, 1, 24, 36],
      }),
    });
    const chartDataArtifact = {
      type: ArtifactTypeEnum.ChartData,
      id: "chart-1",
      value: {
        x: ["Jan", "Feb"],
        y: [12, 18],
      },
    };

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
  });

  it("removes deleted image artifacts and revokes decoded object URLs", () => {
    // Image deletions should clean both the artifact store and any decoded-image cache entry.
    const imageArtifact = {
      type: ArtifactTypeEnum.Image,
      id: "image-1",
      value: {
        contentId: "content-1",
        byteLength: 42,
        mimeType: "image/png",
        sha256: "sha-1",
      },
    };
    const decodedImage = document.createElement("img");
    decodedImage.dataset.objectUrl = "blob:decoded-image-1";
    const revokeSpy = vi.fn();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeSpy,
    });

    useImages.setState({
      x: { [imageArtifact.id]: imageArtifact },
      revisionById: { [imageArtifact.id]: 1 },
      localRevisionById: {},
    });
    useDecodedImages.setState({
      x: { [imageArtifact.id]: decodedImage },
      revisionById: { [imageArtifact.id]: 1 },
      localRevisionById: {},
    });

    updateArtifacts({
      artifacts: [imageArtifact],
      updateType: "delete",
    });

    expect(useImages.getState().x).toEqual({});
    expect(useDecodedImages.getState().x).toEqual({});
    expect(revokeSpy).toHaveBeenCalledWith("blob:decoded-image-1");
  });
});
