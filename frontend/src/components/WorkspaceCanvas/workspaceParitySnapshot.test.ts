import { describe, expect, it } from "vitest";
import { buildWorkspaceCanvasParitySnapshot } from "./workspaceParitySnapshot";
import type { WorkspaceScene } from "./workspaceSceneTypes";

describe("workspace canvas parity snapshot", () => {
  it("exports absolute screen anchors without passive value text", () => {
    const snapshot = buildWorkspaceCanvasParitySnapshot({
      scene: createParityScene(),
      canvasBounds: { x: 40, y: 36, width: 800, height: 600 },
      showMinimap: true,
    });

    expect(snapshot.sections).toHaveLength(1);
    expect(snapshot.sections[0]?.bounds).toEqual({
      x: 48,
      y: 239,
      width: 100,
      height: 50,
    });
    expect(snapshot.sections[0]?.header).toEqual({
      x: 48,
      y: 239,
      width: 100,
      height: 23,
    });
    expect(snapshot.sections[0]?.rows[0]).toMatchObject({
      id: "dict-row:settings:unpinned:token",
      sectionId: "settings",
      paramId: "token",
      passiveKind: "password",
      controlKind: "value-cell",
      row: { x: 52, y: 262, width: 92, height: 10 },
      label: { x: 54, y: 262, width: 30, height: 10 },
      value: { x: 88, y: 262, width: 54, height: 10 },
    });
    expect(snapshot.minimap).toMatchObject({
      visible: true,
      bounds: { x: 620, y: 456, width: 202, height: 152 },
      viewportMask: { x: 630, y: 466, width: 80, height: 60 },
      sectionPreviewCount: 1,
    });
    expect(JSON.stringify(snapshot)).not.toContain("super-secret");
  });
});

function createParityScene(): WorkspaceScene {
  return {
    viewport: { x: -42, y: 193, zoom: 0.5 },
    viewportSize: { width: 800, height: 600 },
    visibleWorkspaceRect: { x: 84, y: -386, width: 1600, height: 1200 },
    projectBounds: { x: 100, y: 20, width: 200, height: 100 },
    rootSectionIds: ["settings"],
    sectionOrder: ["settings"],
    sectionsById: {
      settings: {
        id: "settings",
        type: "Dict",
        name: "Settings",
        parentId: null,
        childIds: [],
        sectionPath: ["settings"],
        localBounds: { x: 100, y: 20, width: 200, height: 100 },
        worldBounds: { x: 100, y: 20, width: 200, height: 100 },
        zIndex: 0,
        selected: false,
        hovered: false,
        active: false,
        childLayoutDirection: "vertical",
        scrollOffset: 0,
        geometry: {
          header: { x: 100, y: 20, width: 200, height: 30 },
          body: { x: 100, y: 50, width: 200, height: 70 },
          childContentRegion: { x: 108, y: 58, width: 184, height: 54 },
          clipRegion: { x: 108, y: 58, width: 184, height: 54 },
        },
        resizeHandles: {
          right: { x: 288, y: 20, width: 12, height: 100 },
          bottom: { x: 100, y: 108, width: 200, height: 12 },
          corner: { x: 288, y: 108, width: 12, height: 12 },
        },
        titleTextPreview: createTextPreview("Settings"),
        nestedDropZones: [],
        edgePortRegions: [],
        renderModel: {
          kind: "dict",
          dict: {
            sectionId: "settings",
            pinnedRegion: { x: 100, y: 50, width: 200, height: 0 },
            unpinnedRegion: { x: 100, y: 50, width: 200, height: 70 },
            scrollOffset: 0,
            visibleRowRange: { start: 0, end: 1, overscan: 3 },
            contentHeight: 20,
            rows: [
              {
                id: "dict-row:settings:unpinned:token",
                sectionId: "settings",
                paramId: "token",
                paramType: "PasswordParam",
                list: "unpinned",
                index: 0,
                depth: 0,
                parentParamId: null,
                path: ["token"],
                label: "Token",
                rect: { x: 108, y: 66, width: 184, height: 20 },
                labelRect: { x: 112, y: 66, width: 60, height: 20 },
                valueRect: { x: 180, y: 66, width: 108, height: 20 },
                controlRect: { x: 180, y: 66, width: 108, height: 20 },
                visibleRect: { x: 108, y: 66, width: 184, height: 20 },
                nestingRails: [],
                visible: true,
                selected: false,
                hovered: false,
                active: false,
                focused: false,
                passiveValue: {
                  kind: "password",
                  text: "super-secret",
                  swatchColor: null,
                  choices: [],
                  masked: true,
                },
                codePreview: null,
                textPreviews: {
                  label: createTextPreview("Token"),
                  value: createTextPreview("super-secret"),
                  control: null,
                },
                errors: [],
                support: {
                  canvasSupport: {
                    passive: "preview",
                    active: "dom-native-overlay",
                  },
                  activeInputStrategy: "dom-native-overlay",
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
              },
            ],
            scrollbar: {
              track: { x: 288, y: 58, width: 8, height: 54 },
              thumb: { x: 288, y: 58, width: 8, height: 24 },
              contentHeight: 100,
              viewportHeight: 54,
            },
            hitRegions: [],
          },
        },
        hitRegions: [],
        cacheKeys: { section: "section", geometry: "geometry" },
      },
    },
    minimap: {
      id: "workspace-minimap",
      bounds: { x: 580, y: 420, width: 202, height: 152 },
      transform: { scale: 1, translateX: 0, translateY: 0 },
      viewportMask: { x: 590, y: 430, width: 80, height: 60 },
      sectionPreviews: [
        {
          sectionId: "settings",
          rect: { x: 600, y: 440, width: 50, height: 30 },
        },
      ],
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
  };
}

function createTextPreview(text: string) {
  return {
    cacheKey: `text:${text}`,
    text,
    font: "12px sans-serif",
    maxWidth: 200,
    measuredWidth: text.length * 7,
    displayText: text,
    displayWidth: text.length * 7,
    truncated: false,
    ready: true,
  };
}
