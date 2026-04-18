import { describe, expect, it, vi } from "vitest";
import type { Node } from "../types";
import {
  buildSectionShellBackdropScene,
  paintSectionShellBackdrop,
} from "./sectionShellBackdrop";

type MockCanvasContext = CanvasRenderingContext2D & {
  beginPath: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  roundRect: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
};

function createNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    height: 60,
    position: { x: 10, y: 20 },
    tempZIndex: 0,
    width: 120,
    zIndex: 0,
    ...overrides,
  };
}

function createMockCanvasContext(): MockCanvasContext {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "#000000",
    font: "12px monospace",
    lineTo: vi.fn(),
    lineWidth: 1,
    moveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    shadowBlur: 0,
    shadowColor: "transparent",
    shadowOffsetY: 0,
    stroke: vi.fn(),
    strokeStyle: "#000000",
    textAlign: "left",
    textBaseline: "alphabetic",
  } as unknown as MockCanvasContext;
}

describe("sectionShellBackdrop", () => {
  it("carries canary header and detail-band metadata into the retained scene", () => {
    const scene = buildSectionShellBackdropScene(
      [
        createNode({
          id: "settings-section__callableSectionDefault",
          height: 80,
        }),
      ],
      {
        getFrameVisual: () => ({
          detailBands: [
            {
              cornerRadius: 12,
              divider: "#ffffff",
              fill: "#fbfcff",
              height: 20,
              offsetY: 24,
            },
            {
              cornerRadius: 0,
              divider: "#f1f5f9",
              fill: "#ffffff",
              height: 24,
              offsetY: 48,
            },
          ],
          detailBoxes: [
            {
              cornerRadius: 999,
              fill: "#94a3b8",
              height: 10,
              width: 28,
              x: 88,
              y: 52,
            },
          ],
          detailTexts: [
            {
              fill: "rgb(3, 47, 98)",
              font: "500 12px monospace",
              maxWidth: 64,
              text: "python",
              x: 56,
              y: 52,
            },
          ],
          fill: "#f5f7fb",
          headerDivider: "#d4dae5",
          headerFill: "#fcfdff",
          headerHeight: 20,
          stroke: "#ffffff",
        }),
      },
    );

    expect(scene.frames).toEqual([
      expect.objectContaining({
        detailBands: [
          {
            cornerRadius: 10,
            divider: "#ffffff",
            fill: "#fbfcff",
            height: 20,
            offsetY: 24,
          },
          {
            cornerRadius: 0,
            divider: "#f1f5f9",
            fill: "#ffffff",
            height: 24,
            offsetY: 48,
          },
        ],
        detailBoxes: [
          {
            cornerRadius: 5,
            fill: "#94a3b8",
            height: 10,
            width: 28,
            x: 88,
            y: 52,
          },
        ],
        detailTexts: [
          {
            fill: "rgb(3, 47, 98)",
            font: "500 12px monospace",
            maxWidth: 64,
            text: "python",
            x: 56,
            y: 52,
          },
        ],
        fill: "#f5f7fb",
        headerDivider: "#d4dae5",
        headerFill: "#fcfdff",
        headerHeight: 20,
        stroke: "#ffffff",
      }),
    ]);
  });

  it("paints callable toolbar and pinned-params bands inside the retained shell", () => {
    const context = createMockCanvasContext();

    paintSectionShellBackdrop(
      context,
      {
        bounds: {
          height: 160,
          width: 160,
          x: 10,
          y: 20,
        },
        frames: [
          {
            detailBands: [
              {
                cornerRadius: 12,
                divider: "#ffffff",
                fill: "#fbfcff",
                height: 32,
                offsetY: 40,
              },
              {
                cornerRadius: 0,
                divider: "#f1f5f9",
                fill: "#ffffff",
                height: 40,
                offsetY: 72,
              },
            ],
            detailBoxes: [
              {
                cornerRadius: 5,
                fill: "#94a3b8",
                height: 10,
                width: 28,
                x: 116,
                y: 70,
              },
            ],
            detailTexts: [
              {
                fill: "rgb(3, 47, 98)",
                font: "500 12px monospace",
                maxWidth: 64,
                text: "python",
                x: 68,
                y: 70,
              },
            ],
            fill: "#f5f7fb",
            headerDivider: "#d4dae5",
            headerFill: "#fcfdff",
            headerHeight: 24,
            height: 160,
            id: "settings-section__callableSectionDefault",
            stroke: "#ffffff",
            width: 160,
            x: 10,
            y: 20,
            zIndex: 0,
          },
        ],
      },
      {
        cornerRadius: 16,
        darkMode: false,
        padding: 24,
      },
    );

    expect(context.fillRect).toHaveBeenCalledWith(24, 24, 160, 24);
    expect(context.roundRect).toHaveBeenCalledWith(24, 64, 160, 32, 12);
    expect(context.roundRect).toHaveBeenCalledWith(24, 96, 160, 40, 0);
    expect(context.roundRect).toHaveBeenCalledWith(140, 94, 28, 10, 5);
    expect(context.fillText).toHaveBeenCalledWith("python", 92, 94, 64);
    expect(context.moveTo).toHaveBeenCalledWith(36, 96);
    expect(context.lineTo).toHaveBeenCalledWith(172, 96);
    expect(context.moveTo).toHaveBeenCalledWith(32, 136);
    expect(context.lineTo).toHaveBeenCalledWith(176, 136);
  });

  it("paints a clipped header band and divider before the outer stroke", () => {
    const context = createMockCanvasContext();

    paintSectionShellBackdrop(
      context,
      {
        bounds: {
          height: 80,
          width: 120,
          x: 10,
          y: 20,
        },
        frames: [
          {
            detailBands: [],
            detailBoxes: [],
            detailTexts: [],
            fill: "#f5f7fb",
            headerDivider: "#d4dae5",
            headerFill: "#fcfdff",
            headerHeight: 24,
            height: 80,
            id: "settings-section__callableSectionDefault",
            stroke: "#ffffff",
            width: 120,
            x: 10,
            y: 20,
            zIndex: 0,
          },
        ],
      },
      {
        cornerRadius: 16,
        darkMode: false,
        padding: 24,
      },
    );

    expect(context.save).toHaveBeenCalledTimes(1);
    expect(context.clip).toHaveBeenCalledTimes(1);
    expect(context.fillRect).toHaveBeenCalledWith(24, 24, 120, 24);
    expect(context.moveTo).toHaveBeenCalledWith(40, 48);
    expect(context.lineTo).toHaveBeenCalledWith(128, 48);
    expect(context.stroke).toHaveBeenCalledTimes(2);
    expect(context.roundRect).toHaveBeenNthCalledWith(1, 24, 24, 120, 80, 16);
    expect(context.roundRect).toHaveBeenNthCalledWith(2, 24, 24, 120, 80, 16);
  });
});
