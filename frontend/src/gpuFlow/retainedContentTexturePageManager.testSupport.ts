import { vi } from "vitest";

import type { HtmlInCanvasCanvas } from "./htmlInCanvasTypes";
import type { GpuRetainedContentScene } from "./retainedContentScene";
import {
  RetainedContentTexturePageManager,
  type RetainedContentTexturePageFrameSurface,
} from "./retainedContentTexturePageManager";
import type { GpuRetainedDomControlTextureDescriptor } from "./retainedDomControlScene";
import type { RetainedTextureUploadSchedulerBudget } from "./retainedTextureUploadScheduler";

export function renderFrame(
  manager: RetainedContentTexturePageManager,
  {
    darkMode = false,
    devicePixelRatio,
    frame,
    surfaces,
    domControlElementById,
    viewportInteractionActive = false,
    viewportZoomBucket,
  }: {
    readonly darkMode?: boolean | undefined;
    readonly devicePixelRatio: number;
    readonly frame: number;
    readonly surfaces: readonly RetainedContentTexturePageFrameSurface[];
    readonly domControlElementById?:
      | ReadonlyMap<string, HTMLElement>
      | undefined;
    readonly viewportInteractionActive?: boolean | undefined;
    readonly viewportZoomBucket: number;
  },
) {
  const preparedFrame = manager.prepareFrame({
    devicePixelRatio,
    frame,
    surfaces,
    viewportZoomBucket,
  });
  const maintenanceInput = {
    darkMode,
    preparedFrame,
    viewportInteractionActive,
  };
  const maintenance = manager.runPostSubmitMaintenance(
    domControlElementById === undefined
      ? maintenanceInput
      : {
          ...maintenanceInput,
          domControlElementById,
        },
  );
  return {
    ...maintenance,
    flatSurfaces: preparedFrame.flatSurfaces,
    refinementPageCount: preparedFrame.refinementPageCount,
    visualEpochs: preparedFrame.visualEpochs,
  };
}

export function createManagerFixture({
  budget,
  maxTextureDimension2D,
  maxPagePixelSize,
  onSubmittedWorkDone,
}: {
  readonly budget?: Partial<RetainedTextureUploadSchedulerBudget> | undefined;
  readonly maxTextureDimension2D?: number | undefined;
  readonly maxPagePixelSize?: number | undefined;
  readonly onSubmittedWorkDone?: (() => Promise<void>) | undefined;
} = {}) {
  const textures: Array<{
    readonly createView: ReturnType<typeof vi.fn>;
    readonly destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const queue = {
    copyElementImageToTexture: vi.fn(),
    copyExternalImageToTexture: vi.fn(),
    ...(onSubmittedWorkDone === undefined ? {} : { onSubmittedWorkDone }),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
  };
  const device = {
    createSampler: vi.fn(() => ({}) as GPUSampler),
    createTexture: vi.fn(() => {
      const texture = {
        createView: vi.fn(() => ({}) as GPUTextureView),
        destroy: vi.fn(),
      };
      textures.push(texture);
      return texture;
    }),
    queue,
    ...(maxTextureDimension2D === undefined
      ? {}
      : { limits: { maxTextureDimension2D } }),
  } as unknown as GPUDevice;
  const scratchCanvas = createScratchCanvas();
  const ownerDocument = {
    createElement: vi.fn(() => scratchCanvas),
  } as unknown as Document;
  const manager = new RetainedContentTexturePageManager(device, ownerDocument, {
    budget,
    maxPagePixelSize,
    scratchCanvas,
    textureUsage: 1,
  });
  return { manager, queue, textures };
}

export function createDomControlTextureElement(
  sourceKey: string,
  requestPaint?: (() => void) | undefined,
): HTMLElement {
  const paintCanvas = requestPaint
    ? ({ requestPaint } as Partial<HtmlInCanvasCanvas>)
    : null;
  return {
    closest: vi.fn(() => null),
    dataset: {
      gpuFlowRetainedDomControlReadyKey: sourceKey,
      gpuFlowRetainedDomControlSourceKey: sourceKey,
    },
    ownerDocument: {
      querySelector: vi.fn((selector: string) =>
        selector === "canvas[data-gpu-flow-surface='true']"
          ? paintCanvas
          : null,
      ),
    },
  } as unknown as HTMLElement;
}

export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export function createFrameSurface(
  overrides: Partial<
    Omit<RetainedContentTexturePageFrameSurface, "domControlTextures">
  > & {
    readonly domControlTextures?:
      | readonly Partial<GpuRetainedDomControlTextureDescriptor>[]
      | undefined;
  } = {},
): RetainedContentTexturePageFrameSurface {
  const contentVersion = overrides.contentVersion ?? 1;
  const { domControlTextures, ...surfaceOverrides } = overrides;
  return {
    contentBoundsCss: { height: 100, width: 100, x: 0, y: 0 },
    contentVersion,
    layout: {
      height: 100,
      surfaceId: "surface-a",
      textureSourceRect: { height: 100, width: 100, x: 0, y: 0 },
      width: 100,
      x: 10,
      y: 20,
    },
    rasterScene: createRasterScene(),
    sourceKey: `source-a:${contentVersion}`,
    sourceVersion: contentVersion,
    sourceWindowCss: { height: 100, width: 100, x: 0, y: 0 },
    surfaceId: "surface-a",
    visibleSourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
    ...(domControlTextures === undefined
      ? {}
      : {
          domControlTextures: domControlTextures.map(
            normalizeDomControlTextureDescriptor,
          ),
        }),
    ...surfaceOverrides,
  };
}

function normalizeDomControlTextureDescriptor(
  texture: Partial<GpuRetainedDomControlTextureDescriptor>,
): GpuRetainedDomControlTextureDescriptor {
  const rectCss = texture.rectCss ?? { height: 20, width: 40, x: 10, y: 12 };
  return {
    controlRectSurfaceCssPx: texture.controlRectSurfaceCssPx ?? rectCss,
    rectCss,
    rowId: texture.rowId ?? "row-a",
    sourceId: texture.sourceId ?? "snapshot-a",
    sourceKey: texture.sourceKey ?? "snapshot-key",
    textureRectDevicePx: texture.textureRectDevicePx ?? rectCss,
  };
}

function createScratchCanvas(): HTMLCanvasElement {
  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
  };
  return {
    getContext: vi.fn(() => context),
    height: 0,
    width: 0,
  } as unknown as HTMLCanvasElement;
}

function createRasterScene(): GpuRetainedContentScene {
  return {
    contentRect: { height: 100, width: 100, x: 0, y: 0 },
    drawCommands: [],
    hitRecords: [],
    id: "scene-a",
    ownerSectionId: "section-a",
    portAnchors: [],
    rowHeight: 20,
    rowOrder: [],
    rows: [],
    scrollOffset: { x: 0, y: 0 },
    viewportRect: { height: 100, width: 100, x: 0, y: 0 },
    visibleRange: { endIndex: 0, rowCount: 0, startIndex: 0 },
  };
}
