import { describe, expect, it } from "vitest";
import { renderWorkspaceCanvas } from "./workspaceCanvasRenderer";
import type {
  WorkspaceDictRowScene,
  WorkspaceScene,
  WorkspaceSectionScene,
} from "./workspaceScene";

type CanvasOperation =
  | {
      kind: "clip";
      rect: { x: number; y: number; width: number; height: number };
    }
  | {
      kind: "fillText";
      text: string;
      x: number;
      y: number;
      fillStyle: string | CanvasGradient | CanvasPattern;
      font: string;
    }
  | {
      kind: "fillRect";
      rect: { x: number; y: number; width: number; height: number };
      fillStyle: string | CanvasGradient | CanvasPattern;
    };

class MockCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  font = "";
  lineJoin: CanvasLineJoin = "miter";
  lineWidth = 1;
  textBaseline: CanvasTextBaseline = "alphabetic";
  operations: Array<CanvasOperation> = [];
  private currentRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;

  setTransform() {}
  clearRect() {}
  save() {}
  restore() {}
  translate() {}
  scale() {}
  beginPath() {
    this.currentRect = null;
  }
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  roundRect(x: number, y: number, width: number, height: number) {
    this.currentRect = { x, y, width, height };
  }
  rect(x: number, y: number, width: number, height: number) {
    this.currentRect = { x, y, width, height };
  }
  clip() {
    if (this.currentRect) {
      this.operations.push({ kind: "clip", rect: this.currentRect });
    }
  }
  fillRect(x: number, y: number, width: number, height: number) {
    this.operations.push({
      kind: "fillRect",
      rect: { x, y, width, height },
      fillStyle: this.fillStyle,
    });
  }
  strokeRect() {}
  fillText(text: string, x: number, y: number) {
    this.operations.push({
      kind: "fillText",
      text,
      x,
      y,
      fillStyle: this.fillStyle,
      font: this.font,
    });
  }
  measureText(text: string) {
    return { width: text.length * 7 } as TextMetrics;
  }
}

describe("workspace canvas renderer", () => {
  it("draws nested sections through a parent clip stack", () => {
    const scene = createRendererScene({
      rootSectionIds: ["parent"],
      sectionOrder: ["parent", "child"],
      sectionsById: {
        parent: createSection({
          id: "parent",
          name: "Parent",
          childIds: ["child"],
          worldBounds: { x: 20, y: 30, width: 260, height: 190 },
        }),
        child: createSection({
          id: "child",
          name: "Child",
          parentId: "parent",
          sectionPath: ["parent", "child"],
          worldBounds: { x: 40, y: 80, width: 120, height: 80 },
        }),
      },
    });
    const context = new MockCanvasContext();

    renderWorkspaceCanvas(
      context as unknown as CanvasRenderingContext2D,
      scene,
      createRenderOptions(),
    );

    const childTitleIndex = context.operations.findIndex(
      (operation) =>
        operation.kind === "fillText" && operation.text === "Child",
    );
    const parentClipIndex = context.operations.findIndex(
      (operation) =>
        operation.kind === "clip" &&
        operation.rect.x === 28 &&
        operation.rect.y === 74 &&
        operation.rect.width === 244 &&
        operation.rect.height === 138,
    );

    expect(parentClipIndex).toBeGreaterThan(-1);
    expect(childTitleIndex).toBeGreaterThan(parentClipIndex);
    expect(
      context.operations.filter(
        (operation) =>
          operation.kind === "fillText" && operation.text === "Child",
      ),
    ).toHaveLength(1);
  });

  it("renders cached code token runs instead of mounting or drawing HTML", () => {
    const row = createDictRow({
      passiveValue: {
        kind: "code",
        text: "def answer():",
        swatchColor: null,
        choices: [],
        masked: false,
      },
      codePreview: {
        language: "python",
        cacheKey: "code-highlight:test",
        tokenRuns: [
          {
            line: 0,
            fromColumn: 0,
            toColumn: 3,
            text: "def",
            color: "#ff7b72",
            fontWeight: "bold",
          },
          {
            line: 0,
            fromColumn: 4,
            toColumn: 10,
            text: "answer",
            color: "#ffa657",
          },
        ],
      },
    });
    const section = createSection({
      id: "dict",
      name: "Dict",
      worldBounds: { x: 20, y: 30, width: 320, height: 160 },
      renderModel: {
        kind: "dict",
        dict: {
          sectionId: "dict",
          pinnedRegion: { x: 20, y: 66, width: 320, height: 0 },
          unpinnedRegion: { x: 20, y: 66, width: 320, height: 124 },
          scrollOffset: 0,
          visibleRowRange: { start: 0, end: 1, overscan: 3 },
          contentHeight: 28,
          rows: [row],
          scrollbar: null,
          hitRegions: [],
        },
      },
    });
    const scene = createRendererScene({
      rootSectionIds: ["dict"],
      sectionOrder: ["dict"],
      sectionsById: { dict: section },
    });
    const context = new MockCanvasContext();

    renderWorkspaceCanvas(
      context as unknown as CanvasRenderingContext2D,
      scene,
      createRenderOptions(),
    );

    const tokenTexts = context.operations
      .filter(isFillTextOperation)
      .filter(
        (operation) => operation.text === "def" || operation.text === "answer",
      );

    expect(tokenTexts.map((operation) => operation.text)).toEqual([
      "def",
      "answer",
    ]);
    expect(tokenTexts[0]).toMatchObject({
      fillStyle: "#ff7b72",
      font: expect.stringContaining("bold"),
    });
    expect(
      context.operations.some(
        (operation) =>
          operation.kind === "fillText" && operation.text === "def answer():",
      ),
    ).toBe(false);
  });
});

function isFillTextOperation(
  operation: CanvasOperation,
): operation is Extract<CanvasOperation, { kind: "fillText" }> {
  return operation.kind === "fillText";
}

function createRenderOptions() {
  return {
    width: 800,
    height: 600,
    devicePixelRatio: 1,
    isDarkMode: true,
    showMinimap: true,
  };
}

function createRendererScene(
  overrides: Pick<
    WorkspaceScene,
    "rootSectionIds" | "sectionOrder" | "sectionsById"
  >,
): WorkspaceScene {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportSize: { width: 800, height: 600 },
    visibleWorkspaceRect: { x: 0, y: 0, width: 800, height: 600 },
    projectBounds: { x: 20, y: 30, width: 320, height: 190 },
    minimap: {
      id: "workspace-minimap",
      bounds: { x: 580, y: 420, width: 202, height: 152 },
      transform: { scale: 0.4, translateX: 580, translateY: 420 },
      viewportMask: { x: 580, y: 420, width: 80, height: 60 },
      sectionPreviews: overrides.sectionOrder.map((sectionId, index) => ({
        sectionId,
        rect: { x: 588 + index * 12, y: 428, width: 40, height: 24 },
      })),
      hitRegions: [],
    },
    hitRegions: [],
    revisionKeys: {
      projectRevision: "project",
      viewportRevision: "viewport",
      sectionScrollRevision: "scroll",
      themeRevision: "theme",
      fontRevision: "font",
      devicePixelRatioRevision: "dpr",
      textMeasurementRevision: "measure",
      highlighterRevision: "highlight",
    },
    cacheKeys: {
      scene: "scene",
      projectBounds: "bounds",
      minimap: "minimap",
      textMeasurement: "text",
      highlighter: "highlight",
    },
    ...overrides,
  };
}

function createSection(
  overrides: Partial<WorkspaceSectionScene> &
    Pick<WorkspaceSectionScene, "id" | "name" | "worldBounds">,
): WorkspaceSectionScene {
  const header = {
    x: overrides.worldBounds.x,
    y: overrides.worldBounds.y,
    width: overrides.worldBounds.width,
    height: 36,
  };
  const body = {
    x: overrides.worldBounds.x,
    y: overrides.worldBounds.y + 36,
    width: overrides.worldBounds.width,
    height: overrides.worldBounds.height - 36,
  };
  const childContentRegion = {
    x: body.x + 8,
    y: body.y + 8,
    width: body.width - 16,
    height: body.height - 16,
  };
  return {
    type: "TextBlock",
    parentId: null,
    childIds: [],
    sectionPath: [overrides.id],
    localBounds: overrides.worldBounds,
    zIndex: 0,
    selected: false,
    hovered: false,
    active: false,
    childLayoutDirection: "vertical",
    scrollOffset: 0,
    geometry: {
      header,
      body,
      childContentRegion,
      clipRegion: childContentRegion,
    },
    resizeHandles: {
      right: { x: 0, y: 0, width: 0, height: 0 },
      bottom: { x: 0, y: 0, width: 0, height: 0 },
      corner: { x: 0, y: 0, width: 0, height: 0 },
    },
    nestedDropZones: [],
    edgePortRegions: [],
    renderModel: {
      kind: "placeholder",
      reason: "Canvas renderer for TextBlock sections is not implemented yet.",
    },
    hitRegions: [],
    cacheKeys: { section: "section", geometry: "geometry" },
    ...overrides,
  };
}

function createDictRow(
  overrides: Partial<WorkspaceDictRowScene> = {},
): WorkspaceDictRowScene {
  const rect = { x: 28, y: 74, width: 304, height: 28 };
  const valueRect = { x: 148, y: 74, width: 184, height: 28 };
  return {
    id: "dict-row:dict:unpinned:code",
    sectionId: "dict",
    paramId: "code",
    paramType: "CodeParam",
    list: "unpinned",
    index: 0,
    depth: 0,
    parentParamId: null,
    path: ["code"],
    label: "Code",
    rect,
    labelRect: { x: 32, y: 74, width: 104, height: 28 },
    valueRect,
    controlRect: valueRect,
    visibleRect: rect,
    nestingRails: [],
    visible: true,
    selected: false,
    hovered: false,
    active: false,
    focused: false,
    passiveValue: {
      kind: "text",
      text: "value",
      swatchColor: null,
      choices: [],
      masked: false,
    },
    codePreview: null,
    errors: [],
    support: {
      canvasSupport: { passive: "preview", active: "dom-rich-overlay" },
      activeInputStrategy: "dom-rich-overlay",
      commitMode: "onBlurOrEnter",
      controlKind: "value-cell",
      primaryHitIntent: "activate-editor",
    },
    hitRegions: [],
    cacheKeys: {
      row: "row",
      textMeasurement: "text",
      valuePreview: "value",
    },
    ...overrides,
  };
}
