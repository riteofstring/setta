import { describe, expect, it } from "vitest";

import {
  RetainedTexturePageCache,
  estimatePageByteSize,
  retainedTexturePageKey,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";

function page(
  overrides: Partial<RetainedTexturePageDescriptor> = {},
): RetainedTexturePageDescriptor {
  return {
    contentVersion: 1,
    lodScale: 1,
    pixelHeight: 128,
    pixelWidth: 128,
    sourceRectCss: { height: 128, width: 128, x: 0, y: 0 },
    surfaceId: "surface",
    tileColumn: 0,
    tileRow: 0,
    ...overrides,
  };
}

describe("retainedTexturePageKey", () => {
  it("keys pages by surface, content version, CSS source rect, LOD, and tile", () => {
    const descriptor = page({
      contentVersion: 7,
      lodScale: 2,
      pixelHeight: 256,
      pixelWidth: 256,
      sourceRectCss: { height: 128, width: 128, x: 64, y: 128 },
      tileColumn: 2,
      tileRow: 4,
    });

    expect(retainedTexturePageKey(descriptor)).toBe(
      "surface:7:64:128:128:128:2:256:256:2:4",
    );
  });
});

describe("RetainedTexturePageCache", () => {
  it("commits pending pages and reports cache bytes", () => {
    const cache = new RetainedTexturePageCache<string>();
    const pending = cache.stagePendingPage({
      descriptor: page({ pixelHeight: 64, pixelWidth: 32 }),
      frame: 4,
    });

    expect(cache.getPendingPage(pending.key)).toEqual(
      expect.objectContaining({
        byteSize: 64 * 32 * 4,
        createdFrame: 4,
      }),
    );

    const committed = cache.commitPendingPage({
      frame: 5,
      key: pending.key,
      resource: "texture-a",
    });

    expect(committed).toEqual(
      expect.objectContaining({
        byteSize: 64 * 32 * 4,
        committedFrame: 5,
        resource: "texture-a",
      }),
    );
    expect(cache.snapshot()).toEqual({
      committedBytes: 64 * 32 * 4,
      committedCount: 1,
      pendingBytes: 0,
      pendingCount: 0,
      totalBytes: 64 * 32 * 4,
    });
  });

  it("returns the highest committed LOD covering the requested CSS rect", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.commitPage({
      descriptor: page({
        lodScale: 1,
        pixelHeight: 256,
        pixelWidth: 256,
        sourceRectCss: { height: 256, width: 256, x: 0, y: 0 },
      }),
      resource: "low",
    });
    cache.commitPage({
      descriptor: page({
        lodScale: 2,
        pixelHeight: 256,
        pixelWidth: 256,
        sourceRectCss: { height: 128, width: 128, x: 64, y: 64 },
        tileColumn: 1,
        tileRow: 1,
      }),
      resource: "high",
    });

    expect(
      cache.getBestCommittedPage({
        contentVersion: 1,
        sourceRectCss: { height: 32, width: 32, x: 80, y: 80 },
        surfaceId: "surface",
        targetLodScale: 3,
        usedFrame: 12,
      }),
    ).toEqual(
      expect.objectContaining({
        lastUsedFrame: 12,
        resource: "high",
      }),
    );
  });

  it("falls back to lower LOD pages when the target LOD is missing", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.commitPage({
      descriptor: page({
        lodScale: 1,
        pixelHeight: 256,
        pixelWidth: 256,
        sourceRectCss: { height: 256, width: 256, x: 0, y: 0 },
      }),
      resource: "low",
    });

    expect(
      cache.getBestCommittedPage({
        contentVersion: 1,
        sourceRectCss: { height: 64, width: 64, x: 96, y: 96 },
        surfaceId: "surface",
        targetLodScale: 4,
      }),
    ).toEqual(expect.objectContaining({ resource: "low" }));
  });

  it("does not use pending pages as renderer fallback", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.stagePendingPage({
      descriptor: page({
        lodScale: 2,
        pixelHeight: 256,
        pixelWidth: 256,
      }),
    });

    expect(
      cache.getBestCommittedPage({
        contentVersion: 1,
        sourceRectCss: { height: 64, width: 64, x: 0, y: 0 },
        surfaceId: "surface",
        targetLodScale: 2,
      }),
    ).toBeNull();
  });

  it("evicts high LOD unprotected pages before protected fallback pages", () => {
    const destroyed: string[] = [];
    const cache = new RetainedTexturePageCache<string>({
      destroyResource: (resource) => destroyed.push(resource),
    });
    const low = cache.commitPage({
      descriptor: page({
        lodScale: 1,
        pixelHeight: 128,
        pixelWidth: 128,
      }),
      frame: 1,
      resource: "low",
    });
    cache.commitPage({
      descriptor: page({
        lodScale: 4,
        pixelHeight: 512,
        pixelWidth: 512,
        tileColumn: 1,
      }),
      frame: 2,
      resource: "high",
    });

    const result = cache.evictToBudget({
      maxBytes: estimatePageByteSize(low.descriptor),
      protectedPageKeys: [low.key],
    });

    expect(result).toEqual({
      evictedBytes: 512 * 512 * 4,
      evictedKeys: ["surface:1:0:0:128:128:4:512:512:1:0"],
      remainingBytes: 128 * 128 * 4,
    });
    expect(destroyed).toEqual(["high"]);
    expect(cache.getCommittedPage(low.key)?.resource).toBe("low");
  });
});
