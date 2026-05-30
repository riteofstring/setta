import { workspaceRectToScreen } from "./workspaceSceneGeometry";
import type {
  WorkspaceDictRowScene,
  WorkspaceRect,
  WorkspaceScene,
  WorkspaceSectionScene,
} from "./workspaceSceneTypes";

export const WORKSPACE_CANVAS_PARITY_SNAPSHOT_KEY =
  "__SETTA_WORKSPACE_CANVAS_PARITY_SNAPSHOT__";

export type WorkspaceParityRect = WorkspaceRect;

export type WorkspaceParityRowSnapshot = {
  id: string;
  sectionId: string;
  paramId: string;
  paramType: string;
  passiveKind: string;
  controlKind: string;
  list: "pinned" | "unpinned";
  index: number;
  depth: number;
  visible: boolean;
  row: WorkspaceParityRect;
  label: WorkspaceParityRect;
  value: WorkspaceParityRect;
  control: WorkspaceParityRect;
};

export type WorkspaceParitySectionSnapshot = {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  childIds: Array<string>;
  selected: boolean;
  active: boolean;
  worldBounds: WorkspaceParityRect;
  bounds: WorkspaceParityRect;
  header: WorkspaceParityRect;
  body: WorkspaceParityRect;
  rows: Array<WorkspaceParityRowSnapshot>;
  scrollbar: WorkspaceParityRect | null;
};

export type WorkspaceParitySnapshot = {
  kind: "workspace-canvas-parity-snapshot";
  revisionKey: string;
  canvasBounds: WorkspaceParityRect;
  viewport: WorkspaceScene["viewport"];
  viewportSize: WorkspaceScene["viewportSize"];
  projectBounds: WorkspaceParityRect;
  visibleWorkspaceRect: WorkspaceParityRect;
  sectionOrder: Array<string>;
  sections: Array<WorkspaceParitySectionSnapshot>;
  minimap: {
    visible: boolean;
    bounds: WorkspaceParityRect;
    viewportMask: WorkspaceParityRect;
    sectionPreviewCount: number;
    sectionPreviews: Array<{
      sectionId: string;
      rect: WorkspaceParityRect;
    }>;
  };
};

type WindowWithWorkspaceParitySnapshot = Window & {
  [WORKSPACE_CANVAS_PARITY_SNAPSHOT_KEY]?: WorkspaceParitySnapshot;
};

export function publishWorkspaceCanvasParitySnapshot(
  scene: WorkspaceScene,
  canvas: HTMLCanvasElement,
  showMinimap: boolean,
) {
  if (typeof window === "undefined") {
    return;
  }
  const snapshot = buildWorkspaceCanvasParitySnapshot({
    scene,
    canvasBounds: domRectToWorkspaceRect(canvas.getBoundingClientRect()),
    showMinimap,
  });
  getWindowWithWorkspaceParitySnapshot()[WORKSPACE_CANVAS_PARITY_SNAPSHOT_KEY] =
    snapshot;
}

export function clearWorkspaceCanvasParitySnapshot() {
  if (typeof window === "undefined") {
    return;
  }
  delete getWindowWithWorkspaceParitySnapshot()[
    WORKSPACE_CANVAS_PARITY_SNAPSHOT_KEY
  ];
}

export function buildWorkspaceCanvasParitySnapshot({
  scene,
  canvasBounds,
  showMinimap,
}: {
  scene: WorkspaceScene;
  canvasBounds: WorkspaceRect;
  showMinimap: boolean;
}): WorkspaceParitySnapshot {
  return {
    kind: "workspace-canvas-parity-snapshot",
    revisionKey: scene.cacheKeys.scene,
    canvasBounds: roundRect(canvasBounds),
    viewport: roundViewport(scene.viewport),
    viewportSize: roundSize(scene.viewportSize),
    projectBounds: roundRect(scene.projectBounds),
    visibleWorkspaceRect: roundRect(scene.visibleWorkspaceRect),
    sectionOrder: scene.sectionOrder,
    sections: scene.sectionOrder
      .map((sectionId) => scene.sectionsById[sectionId])
      .filter(
        (section): section is WorkspaceSectionScene => section !== undefined,
      )
      .map((section) => buildSectionSnapshot(scene, canvasBounds, section)),
    minimap: {
      visible: showMinimap,
      bounds: toAbsoluteScreenRect(canvasBounds, scene.minimap.bounds),
      viewportMask: toAbsoluteScreenRect(
        canvasBounds,
        scene.minimap.viewportMask,
      ),
      sectionPreviewCount: scene.minimap.sectionPreviews.length,
      sectionPreviews: scene.minimap.sectionPreviews.map((preview) => ({
        sectionId: preview.sectionId,
        rect: toAbsoluteScreenRect(canvasBounds, preview.rect),
      })),
    },
  };
}

function buildSectionSnapshot(
  scene: WorkspaceScene,
  canvasBounds: WorkspaceRect,
  section: WorkspaceSectionScene,
): WorkspaceParitySectionSnapshot {
  return {
    id: section.id,
    type: String(section.type),
    name: section.name,
    parentId: section.parentId,
    childIds: section.childIds,
    selected: section.selected,
    active: section.active,
    worldBounds: roundRect(section.worldBounds),
    bounds: toAbsoluteWorkspaceScreenRect(
      canvasBounds,
      scene,
      section.worldBounds,
    ),
    header: toAbsoluteWorkspaceScreenRect(
      canvasBounds,
      scene,
      section.geometry.header,
    ),
    body: toAbsoluteWorkspaceScreenRect(
      canvasBounds,
      scene,
      section.geometry.body,
    ),
    rows:
      section.renderModel.kind === "dict"
        ? section.renderModel.dict.rows.map((row) =>
            buildRowSnapshot(scene, canvasBounds, row),
          )
        : [],
    scrollbar:
      section.renderModel.kind === "dict" && section.renderModel.dict.scrollbar
        ? toAbsoluteWorkspaceScreenRect(
            canvasBounds,
            scene,
            section.renderModel.dict.scrollbar.track,
          )
        : null,
  };
}

function buildRowSnapshot(
  scene: WorkspaceScene,
  canvasBounds: WorkspaceRect,
  row: WorkspaceDictRowScene,
): WorkspaceParityRowSnapshot {
  return {
    id: row.id,
    sectionId: row.sectionId,
    paramId: row.paramId,
    paramType: String(row.paramType),
    passiveKind: row.passiveValue.kind,
    controlKind: row.support.controlKind,
    list: row.list,
    index: row.index,
    depth: row.depth,
    visible: row.visibleRect !== null,
    row: toAbsoluteWorkspaceScreenRect(canvasBounds, scene, row.rect),
    label: toAbsoluteWorkspaceScreenRect(canvasBounds, scene, row.labelRect),
    value: toAbsoluteWorkspaceScreenRect(canvasBounds, scene, row.valueRect),
    control: toAbsoluteWorkspaceScreenRect(
      canvasBounds,
      scene,
      row.controlRect,
    ),
  };
}

function toAbsoluteWorkspaceScreenRect(
  canvasBounds: WorkspaceRect,
  scene: WorkspaceScene,
  rect: WorkspaceRect,
) {
  return toAbsoluteScreenRect(
    canvasBounds,
    workspaceRectToScreen(rect, scene.viewport),
  );
}

function toAbsoluteScreenRect(
  canvasBounds: WorkspaceRect,
  rect: WorkspaceRect,
) {
  return roundRect({
    x: canvasBounds.x + rect.x,
    y: canvasBounds.y + rect.y,
    width: rect.width,
    height: rect.height,
  });
}

function domRectToWorkspaceRect(rect: DOMRect): WorkspaceRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function roundRect(rect: WorkspaceRect): WorkspaceRect {
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function roundViewport(viewport: WorkspaceScene["viewport"]) {
  return {
    x: round(viewport.x),
    y: round(viewport.y),
    zoom: round(viewport.zoom),
  };
}

function roundSize(size: WorkspaceScene["viewportSize"]) {
  return {
    width: round(size.width),
    height: round(size.height),
  };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function getWindowWithWorkspaceParitySnapshot() {
  return window as WindowWithWorkspaceParitySnapshot;
}
