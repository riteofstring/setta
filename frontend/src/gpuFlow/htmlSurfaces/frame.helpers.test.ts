import { vi } from "vitest";
import { buildGpuEdgeGeometry } from "../edges/edgeGeometry";
import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";
import { type GpuHtmlSurfaceOverlayLayout, type GpuNodeLayout } from "./frame";
import type { RenderHtmlSurfacesInput } from "./renderer";
import type {
  HtmlSurfaceTextureRecord,
  UploadDirtyHtmlSurfaceTexturesOptions,
} from "./textures";

export function node(
  nodeId: string,
  x: number,
  y: number,
  width: number | null,
  height: number | null,
  zIndex: number,
): GpuNodeLayout {
  return {
    height,
    nodeId,
    width,
    x,
    y,
    zIndex,
  };
}

export function surfaceOverlay(
  surfaceId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
  ownerNodeId?: string,
): GpuHtmlSurfaceOverlayLayout {
  return {
    height,
    ownerNodeId,
    surfaceId,
    width,
    x,
    y,
    zIndex,
  };
}

export function getRegisterTextureCall(
  manager: ReturnType<typeof createFrameTextureManager>,
  surfaceId: string,
) {
  const call = manager.registerSurfaceTexture.mock.calls.find(
    ([input]) => input.surfaceId === surfaceId,
  );
  if (!call) {
    throw new Error(`Missing registerSurfaceTexture call for ${surfaceId}.`);
  }
  return call[0];
}

export function mockElementBox(
  element: HTMLElement,
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "width">,
) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.bottom - rect.height,
    toJSON: () => rect,
  } as DOMRect);
  vi.spyOn(element, "getClientRects").mockReturnValue({
    length: 1,
  } as DOMRectList);
}

export function toVisibleQuad(layout: GpuNodeLayout) {
  if (layout.width === null || layout.height === null) {
    throw new Error("Expected a renderable node layout.");
  }
  return {
    height: layout.height,
    nodeId: layout.nodeId,
    width: layout.width,
    x: layout.x,
    y: layout.y,
    zIndex: layout.zIndex ?? 0,
  };
}

export function createGpuPaintNodeElement(nodeId: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.gpuFlowHtmlSource = "true";
  element.setAttribute("data-gpu-flow-source-id", nodeId);
  element.dataset.gpuFlowNode = "true";
  element.dataset.id = nodeId;
  return element;
}

export class ThrowOnMapIteration<K, V> extends Map<K, V> {
  iterationCount = 0;

  override [Symbol.iterator](): MapIterator<[K, V]> {
    this.iterationCount += 1;
    throw new Error("Paint owner resolution must not iterate mounted nodes.");
  }

  override entries(): MapIterator<[K, V]> {
    this.iterationCount += 1;
    throw new Error("Paint owner resolution must not iterate mounted nodes.");
  }
}

export function textureRecord(
  nodeId: string,
  overrides: Partial<HtmlSurfaceTextureRecord> = {},
): HtmlSurfaceTextureRecord {
  return {
    lastUploadFrame: 0,
    sampler: {},
    surfaceId: nodeId,
    texture: {},
    textureBytes: 0,
    textureLayout: { kind: "single", tileCount: 1 },
    textureView: {},
    tiles: [],
    ...overrides,
  } as HtmlSurfaceTextureRecord;
}

export function canvasSize() {
  return {
    cssHeight: 300,
    cssWidth: 400,
    devicePixelRatio: 2,
    pixelHeight: 600,
    pixelWidth: 800,
  };
}

export function createFrameTextureManager() {
  const records = new Map<string, HtmlSurfaceTextureRecord>();
  type EvictSurfaceTexturesInput = {
    readonly budgetBytes?: number | undefined;
    readonly protectedSurfaceIds?:
      | ReadonlySet<string>
      | readonly string[]
      | undefined;
    readonly reason?: string | undefined;
    readonly visibleSurfaceIds?:
      | ReadonlySet<string>
      | readonly string[]
      | undefined;
  };
  const manager = {
    evictSurfaceTextures: vi.fn((input?: EvictSurfaceTexturesInput) => {
      void input;
      return {
        budgetBytes: Number.POSITIVE_INFINITY,
        evictedBytes: 0,
        evictedSurfaceIds: [] as string[],
        memory: EMPTY_TEXTURE_MEMORY_SNAPSHOT,
        memoryBefore: EMPTY_TEXTURE_MEMORY_SNAPSHOT,
        overBudgetBytes: 0,
        protectedSurfaceIds: [] as string[],
        reason: "html-surface-frame",
      };
    }),
    getSurfaceTexture: vi.fn((nodeId: string) => records.get(nodeId)),
    markSurfaceTextureDirty: vi.fn(),
    markSurfacesPainted: vi.fn(),
    registerSurfaceTexture: vi.fn(
      ({ surfaceId }: { readonly surfaceId: string }) => {
        const record = textureRecord(surfaceId) as HtmlSurfaceTextureRecord & {
          lastUploadFrame: number;
        };
        record.lastUploadFrame = -1;
        records.set(surfaceId, record);
        return record;
      },
    ),
    uploadDirtySurfaceTextures: vi.fn(
      ({ frame }: UploadDirtyHtmlSurfaceTexturesOptions) => {
        const uploaded = Array.from(records.values()) as Array<
          HtmlSurfaceTextureRecord & { lastUploadFrame: number }
        >;
        uploaded.forEach((record) => {
          record.lastUploadFrame = frame;
        });
        return {
          budgetExhausted: false,
          diagnostics: [],
          remainingDirtySurfaceIds: [],
          skippedSurfaceIds: [],
          skippedUploadBytes: 0,
          uploaded,
          uploadedBytes: uploaded.reduce(
            (bytes, record) => bytes + record.textureBytes,
            0,
          ),
        };
      },
    ),
  };
  return manager;
}

const EMPTY_TEXTURE_MEMORY_SNAPSHOT = {
  allocatedBytes: 0,
  largestTextureBytes: 0,
  textureCount: 0,
  visibleBytes: 0,
  visibleTextureCount: 0,
};

export function createFrameRenderer() {
  return {
    render: vi.fn(({ edges, scene }: RenderHtmlSurfacesInput) => ({
      drawnEdgeIds: edges?.map((edge) => edge.edgeId) ?? [],
      drawnSurfaceIds: [
        ...scene.flatSurfaces.map((surface) => surface.surfaceId),
        ...scene.tiledFlatSurfaces.map((surface) => surface.surfaceId),
        ...scene.solidRoundedRectSurfaces.map((surface) => surface.surfaceId),
      ],
      edgeVertexCount: (edges?.length ?? 0) * 2,
      vertexCount:
        (scene.flatSurfaces.length +
          scene.tiledFlatSurfaces.length +
          scene.solidRoundedRectSurfaces.length) *
        6,
    })),
  };
}

export function createGpuTextureMock() {
  const copyElementImageToTexture = vi.fn();
  const createTexture = vi.fn(() => {
    return {
      createView: vi.fn(() => ({}) as GPUTextureView),
      destroy: vi.fn(),
    } as unknown as GPUTexture;
  });
  const createSampler = vi.fn(() => ({}) as GPUSampler);
  const device = {
    createSampler,
    createTexture,
    destroy: vi.fn(),
    limits: {
      maxTextureDimension2D: 4096,
    },
    queue: {
      copyElementImageToTexture,
    },
  } as unknown as GPUDevice;

  return {
    copyElementImageToTexture,
    createSampler,
    createTexture,
    device,
  };
}

export function installTextureUsage() {
  vi.stubGlobal("GPUTextureUsage", {
    COPY_DST: 2,
    RENDER_ATTACHMENT: 4,
    TEXTURE_BINDING: 1,
  });
}

export function edge(
  edgeId: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): GpuEdgeBufferInput {
  return {
    edgeId,
    geometry: buildGpuEdgeGeometry({
      edgeId,
      source: { x: sourceX, y: sourceY },
      target: { x: targetX, y: targetY },
      type: "straight",
    }),
  };
}
