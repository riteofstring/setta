import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  useArtifacts as useArtifactsCompat,
  useImages as useImagesCompat,
} from "../definitions";
import { resetProjectStores } from "../utils";
import {
  useArtifacts,
  useBrushStrokes,
  useChartData,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
} from "./artifactStores";

describe("artifactStores", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("starts in-memory artifact lookups empty", () => {
    expect(useArtifactsCompat).toBe(useArtifacts);

    expect(useArtifacts.getState()).toEqual({
      x: {},
      namePathTypeToId: {},
      reset: expect.any(Function),
    });
  });

  it("starts revisioned artifact stores empty", () => {
    expect(useImagesCompat).toBe(useImages);

    const expectedRevisionedState = {
      x: {},
      revisionById: {},
      localRevisionById: {},
      reset: expect.any(Function),
    };

    expect(useImages.getState()).toEqual(expectedRevisionedState);
    expect(useChartData.getState()).toEqual(expectedRevisionedState);
    expect(useDecodedImages.getState()).toEqual(expectedRevisionedState);
    expect(useBrushStrokes.getState()).toEqual(expectedRevisionedState);
    expect(useDrawAreaLayerItemTransform.getState()).toEqual(
      expectedRevisionedState,
    );
  });
});
