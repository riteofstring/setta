import { describe, expect, it } from "vitest";
import {
  chooseTextureResolution,
  chooseZoomBucket,
  textureResolutionMatches,
} from "./textureResolution";

describe("chooseTextureResolution", () => {
  it("chooses the smallest bucket that can satisfy the current zoom", () => {
    const resolution = chooseTextureResolution({
      cssHeight: 80,
      cssWidth: 120,
      devicePixelRatio: 2,
      maxTextureDimension2D: 4096,
      zoom: 1.1,
    });

    expect(resolution).toMatchObject({
      clampedByMaxTexture: false,
      pixelHeight: 200,
      pixelWidth: 300,
      requestedScale: 2.5,
      resolutionScale: 2.5,
      zoomBucket: 1.25,
    });
  });

  it("clamps resolution scale to the device max texture dimension", () => {
    const resolution = chooseTextureResolution({
      cssHeight: 500,
      cssWidth: 1000,
      devicePixelRatio: 2,
      maxTextureDimension2D: 4096,
      zoom: 4,
    });

    expect(resolution).toMatchObject({
      clampedByMaxTexture: true,
      pixelHeight: 2048,
      pixelWidth: 4096,
      requestedScale: 8,
      resolutionScale: 4.096,
      zoomBucket: 4,
    });
  });

  it("caps zoom requests above the largest bucket", () => {
    expect(chooseZoomBucket(8)).toBe(4);
  });

  it("compares texture resolution snapshots exactly", () => {
    expect(
      textureResolutionMatches(
        {
          pixelHeight: 100,
          pixelWidth: 200,
          resolutionScale: 2,
          zoomBucket: 1,
        },
        {
          pixelHeight: 100,
          pixelWidth: 200,
          resolutionScale: 2,
          zoomBucket: 1,
        },
      ),
    ).toBe(true);
    expect(
      textureResolutionMatches(
        {
          pixelHeight: 100,
          pixelWidth: 200,
          resolutionScale: 2,
          zoomBucket: 1,
        },
        {
          pixelHeight: 100,
          pixelWidth: 250,
          resolutionScale: 2.5,
          zoomBucket: 1.25,
        },
      ),
    ).toBe(false);
  });
});
