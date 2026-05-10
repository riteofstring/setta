import { describe, expect, it, vi } from "vitest";

import type { GpuRetainedTextLikeRowSnapshotSource } from "./GpuFlow/retainedTextLikeRowSnapshotSources";
import { RetainedTextLikeRowTextureManager } from "./retainedTextLikeRowTextureManager";
import type { RetainedTextLikeRowTextureFrameSurface } from "./retainedTextLikeRowTextureVisuals";

describe("RetainedTextLikeRowTextureManager", () => {
  it("keeps browser-rendered row text drawable while retained pages are missing during viewport interaction", () => {
    const fixture = createFixture();
    const source = createSource();

    const firstFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      elementBySourceId: new Map([
        [source.sourceId, createSourceElement(source)],
      ]),
      frame: 1,
      sources: [source],
      surfaces: [createSurface()],
      viewportInteractionActive: false,
      zoom: 1,
    });

    expect(firstFrame.flatSurfaces).toHaveLength(1);
    expect(firstFrame.readyTextureCount).toBe(1);
    expect(fixture.queue.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    const interactionFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      elementBySourceId: new Map(),
      frame: 2,
      sources: [source],
      surfaces: [createSurface()],
      viewportInteractionActive: true,
      zoom: 3,
    });

    expect(interactionFrame.flatSurfaces).toHaveLength(1);
    expect(interactionFrame.readyTextureCount).toBe(1);
    expect(interactionFrame.missingElementCount).toBe(1);
    expect(fixture.queue.copyElementImageToTexture).toHaveBeenCalledTimes(1);
  });

  it("draws the last committed row text while the replacement value upload is pending", () => {
    const fixture = createFixture();
    const originalSource = createSource({ code: "alpha" });
    const replacementSource = createSource({ code: "beta" });

    fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      elementBySourceId: new Map([
        [originalSource.sourceId, createSourceElement(originalSource)],
      ]),
      frame: 1,
      sources: [originalSource],
      surfaces: [createSurface()],
      viewportInteractionActive: false,
      zoom: 1,
    });
    fixture.queue.copyElementImageToTexture.mockClear();

    const replacementFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      elementBySourceId: new Map([
        [replacementSource.sourceId, createSourceElement(replacementSource)],
      ]),
      frame: 2,
      sources: [replacementSource],
      surfaces: [createSurface()],
      uploadBudget: { maxUploads: 0 },
      viewportInteractionActive: false,
      zoom: 1,
    });

    expect(replacementFrame.flatSurfaces).toHaveLength(1);
    expect(replacementFrame.staleTextureCount).toBe(1);
    expect(replacementFrame.budgetExhausted).toBe(true);
    expect(fixture.queue.copyElementImageToTexture).not.toHaveBeenCalled();
  });
});

function createFixture() {
  vi.stubGlobal("GPUTextureUsage", {
    COPY_DST: 1,
    RENDER_ATTACHMENT: 2,
    TEXTURE_BINDING: 4,
  });
  const queue = {
    copyElementImageToTexture: vi.fn(),
    copyExternalImageToTexture: vi.fn(),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
  };
  const device = {
    createSampler: vi.fn(() => ({}) as GPUSampler),
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({}) as GPUTextureView),
      destroy: vi.fn(),
    })),
    limits: { maxTextureDimension2D: 4096 },
    queue,
  } as unknown as GPUDevice;
  const canvas = {
    layoutSubtree: true,
    onpaint: null,
    requestPaint: vi.fn(),
  } as unknown as ConstructorParameters<
    typeof RetainedTextLikeRowTextureManager
  >[0]["canvas"];
  const manager = new RetainedTextLikeRowTextureManager(
    {
      canvas,
      device,
      maxTextureDimension2D: 4096,
    },
    {
      textureUsage: 1,
    },
  );
  return { manager, queue };
}

function createSource(
  overrides: Partial<GpuRetainedTextLikeRowSnapshotSource> = {},
): GpuRetainedTextLikeRowSnapshotSource {
  const base = {
    code: "alpha",
    defaultValue: "",
    disabled: false,
    error: false,
    language: "python",
    linePolicy: "single-line" as const,
    rowId: "row-a",
    sectionId: "section-a",
    sourceHeight: 24,
    sourceId: "retained-text-like-row-snapshot:surface-a:row-a",
    sourceKey: "",
    sourceWidth: 120,
    surfaceId: "surface-a",
    targetRectCss: { height: 24, width: 120, x: 40, y: 16 },
    wrapLines: false,
    ...overrides,
  };
  return {
    ...base,
    sourceKey: JSON.stringify({
      code: base.code,
      height: base.sourceHeight,
      rowId: base.rowId,
      width: base.sourceWidth,
    }),
  };
}

function createSourceElement(
  source: GpuRetainedTextLikeRowSnapshotSource,
): HTMLElement {
  return {
    dataset: {
      gpuFlowRetainedTextLikeRowSnapshotSourceKey: source.sourceKey,
    },
  } as unknown as HTMLElement;
}

function createSurface(): RetainedTextLikeRowTextureFrameSurface {
  return {
    layout: {
      height: 100,
      surfaceId: "surface-a",
      textureSourceRect: { height: 100, width: 160, x: 0, y: 0 },
      width: 160,
      x: 10,
      y: 20,
      zIndex: 4,
    },
    surfaceId: "surface-a",
  };
}
