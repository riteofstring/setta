/* @vitest-environment jsdom */

import type { RefObject } from "react";
import {
  useBrushStrokes,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
} from "state/definitions";
import {
  ArtifactTypeEnum,
  createBrushStroke,
  createBrushStrokeArtifact,
  createDrawAreaLayer,
  createDrawAreaLayerItem,
  createDrawAreaLayerItemTransformArtifact,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawOneLayer } from "./canvasUtils";
import type { ResizeHandleCorners, TempCanvasesType } from "./types";

type MockCanvasContext = CanvasRenderingContext2D & {
  beginPath: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  resetTransform: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
};

let contextByCanvas: WeakMap<HTMLCanvasElement, MockCanvasContext>;
let getContextSpy: ReturnType<typeof vi.spyOn>;

function resetDrawAreaStores() {
  useDecodedImages.getState().reset();
  useBrushStrokes.getState().reset();
  useDrawAreaLayerItemTransform.getState().reset();
}

function createMockCanvasContext(): MockCanvasContext {
  return {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "round",
    fillStyle: "#000000",
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    resetTransform: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
  } as unknown as MockCanvasContext;
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  const ctx = createMockCanvasContext();
  contextByCanvas.set(canvas, ctx);
  return { canvas, ctx };
}

function createTempCanvasRefs(
  layerCanvas: HTMLCanvasElement,
  artifactCanvas: HTMLCanvasElement,
): RefObject<TempCanvasesType> {
  return {
    current: {
      layer: layerCanvas,
      artifact: artifactCanvas,
    },
  } as RefObject<TempCanvasesType>;
}

beforeEach(() => {
  resetDrawAreaStores();
  contextByCanvas = new WeakMap();
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(function () {
      return contextByCanvas.get(this) ?? null;
    });
});

afterEach(() => {
  getContextSpy.mockRestore();
  resetDrawAreaStores();
});

describe("drawOneLayer", () => {
  it("renders image items with stored and preview eraser strokes", () => {
    const { canvas: layerCanvas, ctx: layerCtx } = createCanvas();
    const { canvas: layerTempCanvas, ctx: layerTempCtx } = createCanvas();
    const { canvas: artifactTempCanvas, ctx: artifactTempCtx } = createCanvas();
    const tempCanvasRefs = createTempCanvasRefs(
      layerTempCanvas,
      artifactTempCanvas,
    );

    const image = document.createElement("img");
    image.width = 40;
    image.height = 20;
    Object.defineProperty(image, "complete", {
      configurable: true,
      value: true,
    });

    const storedEraserStroke = {
      ...createBrushStroke({
        globalCompositeOperation: "destination-out",
        lineWidth: 2,
        points: [
          [1, 1],
          [10, 10],
        ],
        strokeStyle: "rgba(0,0,0,1)",
      }),
      transform: [1, 0, 0, 1, 0, 0] as [1, 0, 0, 1, 0, 0],
    };

    const transformArtifact = createDrawAreaLayerItemTransformArtifact({
      id: "transform-image",
      value: {
        transform: [1, 0, 0, 1, 0, 0],
        eraserStrokes: [storedEraserStroke],
      },
    });

    useDecodedImages.setState({
      ...useDecodedImages.getState(),
      x: { "image-1": image },
    });
    useDrawAreaLayerItemTransform.setState({
      ...useDrawAreaLayerItemTransform.getState(),
      x: { [transformArtifact.id]: transformArtifact },
    });

    const layer = createDrawAreaLayer({
      layerOpacity: 0.5,
      elements: [
        createDrawAreaLayerItem({
          type: ArtifactTypeEnum.Image,
          dataPath: "image-1",
          transformId: transformArtifact.id,
        }),
      ],
    });

    drawOneLayer({
      layer,
      layerCanvas,
      tempCanvasRefs,
      realTimeEraserStroke: createBrushStroke({
        globalCompositeOperation: "destination-out",
        lineWidth: 2,
        points: [
          [5, 5],
          [15, 10],
        ],
        strokeStyle: "rgba(0,0,0,1)",
      }),
    });

    expect(artifactTempCtx.drawImage).toHaveBeenCalledWith(image, 0, 0, 40, 20);
    expect(artifactTempCtx.stroke).toHaveBeenCalled();
    expect(layerTempCtx.drawImage).toHaveBeenCalledWith(
      artifactTempCanvas,
      0,
      0,
    );
    expect(layerCtx.drawImage).toHaveBeenCalledWith(layerTempCanvas, 0, 0);
    expect(artifactTempCtx.resetTransform).toHaveBeenCalledTimes(1);
  });

  it("renders brush stroke items and resize handles", () => {
    const { canvas: layerCanvas, ctx: layerCtx } = createCanvas();
    const { canvas: layerTempCanvas } = createCanvas();
    const { canvas: artifactTempCanvas, ctx: artifactTempCtx } = createCanvas();
    const tempCanvasRefs = createTempCanvasRefs(
      layerTempCanvas,
      artifactTempCanvas,
    );

    const brushStroke = createBrushStrokeArtifact({
      id: "brush-1",
      value: createBrushStroke({
        lineWidth: 3,
        points: [
          [0, 0],
          [10, 10],
        ],
        strokeStyle: "#123456",
      }),
    });
    const transformArtifact = createDrawAreaLayerItemTransformArtifact({
      id: "transform-brush",
      value: {
        transform: [1, 0, 0, 1, 3, 4],
        eraserStrokes: [],
      },
    });

    useBrushStrokes.setState({
      ...useBrushStrokes.getState(),
      x: { [brushStroke.id]: brushStroke },
    });
    useDrawAreaLayerItemTransform.setState({
      ...useDrawAreaLayerItemTransform.getState(),
      x: { [transformArtifact.id]: transformArtifact },
    });

    const layer = createDrawAreaLayer({
      elements: [
        createDrawAreaLayerItem({
          type: ArtifactTypeEnum.BrushStroke,
          dataPath: brushStroke.id,
          transformId: transformArtifact.id,
        }),
      ],
    });
    const resizeHandles: ResizeHandleCorners = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ];

    drawOneLayer({
      layer,
      layerCanvas,
      tempCanvasRefs,
      realTimeResizeHandles: resizeHandles,
    });

    expect(artifactTempCtx.beginPath).toHaveBeenCalled();
    expect(artifactTempCtx.stroke).toHaveBeenCalled();
    expect(layerCtx.fillRect).toHaveBeenCalledTimes(4);
  });
});
