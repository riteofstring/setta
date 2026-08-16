import { getPaneRect } from "../canvas/graph";
import { getReactFlowStore } from "../canvas/store";
import { getMetaControlMinimumSize } from "../controls/meta/metaControlTypes";
import { isGroupSection } from "../document/documentSelectors";
import { getMetaControlPresentation } from "../document/sectionKindRegistry";
import { resolveWorkspaceSectionSize } from "../document/sectionSize";
import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../document/stores";
import type {
  Position,
  SectionSizeValue,
  WorkspaceSectionInput,
} from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import { SECTION_SIZING_POLICY } from "./resize/sizingPolicy";

// Where a section goes when nobody pointed at a place for it. The reference sends this decision to
// its backend (`CreateTopLevelSection` with a null position, the current top-level layout, and the
// visible pane), which searches the same three places in the same order: inside the visible pane,
// then beside it, then after everything the workspace already contains. The package is
// backend-free, so it owns the search, and it reads the same inputs the reference sends: measured
// top-level rectangles and the pane rectangle in flow coordinates.
//
// Sizes resolve exactly as the reference's `resolveAutoLayoutDimension` does — a measured or
// explicit dimension wins, and an automatic one reserves the sizing policy's minimum for that axis
// (never below 1). A section that grows past its reservation once it mounts is the same outcome
// the reference produces.

type WorkspaceEmptySpacePlacement = Readonly<{
  position: Position;
  // Set when the section did not land in the visible pane, so the canvas has to travel to it. The
  // reference's `panTo`: the point the viewport centers on.
  panTo: Position | null;
}>;

type PlacementRect = { x: number; y: number; w: number; h: number };
type PlacementExtent = { width: number; height: number };

const PLACEMENT_PADDING = 24;
const MINIMUM_GRID_STEP = 20;
const MAXIMUM_GRID_STEP = 80;

function resolveMinimumExtent(
  host: WorkspaceHost,
  section: WorkspaceSectionInput,
): PlacementExtent {
  const presentation = isGroupSection(section)
    ? null
    : getMetaControlPresentation(host, section);
  const minimumSize = presentation
    ? getMetaControlMinimumSize(presentation.resolveControlKind(section))
    : null;
  return {
    width: Math.max(1, SECTION_SIZING_POLICY.minWidth, minimumSize?.width ?? 0),
    height: Math.max(
      1,
      SECTION_SIZING_POLICY.minHeight,
      minimumSize?.height ?? 0,
    ),
  };
}

function resolveExtentDimension(
  measured: number | null,
  size: SectionSizeValue,
  minimum: number,
): number {
  if (measured !== null && Number.isFinite(measured) && measured > 0) {
    return measured;
  }
  return size === "auto" ? minimum : size;
}

function resolveSectionExtent(
  host: WorkspaceHost,
  section: WorkspaceSectionInput,
  measured: { width: number | null; height: number | null },
): PlacementExtent {
  const size = resolveWorkspaceSectionSize(host, section);
  const minimum = resolveMinimumExtent(host, section);
  return {
    width: resolveExtentDimension(measured.width, size.width, minimum.width),
    height: resolveExtentDimension(
      measured.height,
      size.height,
      minimum.height,
    ),
  };
}

// The reference's `createTopLevelSectionLayoutDict`: the stored layout, with the canvas's own
// measurements of anything it has already laid out written over it.
function buildOccupiedRects(host: WorkspaceHost): Array<PlacementRect> {
  const { sections, topLevelSections } =
    getWorkspaceDocumentStore(host).getState();
  const nodes = getNodeInternalsStore(host).getState().x;
  return Object.entries(topLevelSections).flatMap(([sectionId, layout]) => {
    const section = sections[sectionId];
    if (!section) {
      return [];
    }
    const node = nodes.get(sectionId);
    const extent = resolveSectionExtent(host, section, {
      width: node?.width ?? layout.w,
      height: node?.height ?? layout.h,
    });
    return [{ x: layout.x, y: layout.y, w: extent.width, h: extent.height }];
  });
}

function getVisiblePaneRect(host: WorkspaceHost): PlacementRect | null {
  const state = getReactFlowStore(host).getState();
  if (state.width <= 0 || state.height <= 0) {
    return null;
  }
  const pane = getPaneRect(host, state);
  if (pane.width <= 0 || pane.height <= 0) {
    return null;
  }
  return { x: pane.x, y: pane.y, w: pane.width, h: pane.height };
}

function expandRect(rect: PlacementRect, padding: number): PlacementRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };
}

function rectsIntersect(left: PlacementRect, right: PlacementRect): boolean {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}

function intersectsAny(
  candidate: PlacementRect,
  rects: ReadonlyArray<PlacementRect>,
): boolean {
  return rects.some((rect) => rectsIntersect(candidate, rect));
}

function getOccupiedBounds(
  rects: ReadonlyArray<PlacementRect>,
): PlacementRect | null {
  const first = rects[0];
  if (!first) {
    return null;
  }
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.w;
  let maxY = first.y + first.h;
  for (const rect of rects.slice(1)) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// The reference's `gridStepForCreateTopLevelSection`: a search step proportional to the section
// being placed, so a small section can slot into a small gap and a large one does not crawl.
function getGridStep(extent: PlacementExtent): number {
  return Math.max(
    MINIMUM_GRID_STEP,
    Math.min(MAXIMUM_GRID_STEP, Math.min(extent.width, extent.height) / 3),
  );
}

function findPositionInBounds(
  bounds: PlacementRect,
  extent: PlacementExtent,
  rects: ReadonlyArray<PlacementRect>,
): Position | null {
  if (bounds.w <= 0 || bounds.h <= 0) {
    return null;
  }
  const startX = bounds.x + PLACEMENT_PADDING;
  const startY = bounds.y + PLACEMENT_PADDING;
  const endX = bounds.x + bounds.w - extent.width - PLACEMENT_PADDING;
  const endY = bounds.y + bounds.h - extent.height - PLACEMENT_PADDING;
  if (endX < startX || endY < startY) {
    return null;
  }
  const padded = rects.map((rect) => expandRect(rect, PLACEMENT_PADDING));
  const step = getGridStep(extent);
  for (let y = startY; y <= endY; y += step) {
    for (let x = startX; x <= endX; x += step) {
      const candidate = { x, y, w: extent.width, h: extent.height };
      if (!intersectsAny(candidate, padded)) {
        return { x, y };
      }
    }
  }
  return null;
}

function getRightBounds(
  bounds: PlacementRect,
  extent: PlacementExtent,
): PlacementRect {
  return {
    x: bounds.x + bounds.w,
    y: bounds.y - PLACEMENT_PADDING,
    w: extent.width + PLACEMENT_PADDING * 2,
    h: bounds.h + PLACEMENT_PADDING * 2,
  };
}

function getBottomBounds(
  bounds: PlacementRect,
  extent: PlacementExtent,
): PlacementRect {
  return {
    x: bounds.x - PLACEMENT_PADDING,
    y: bounds.y + bounds.h,
    w: bounds.w + PLACEMENT_PADDING * 2,
    h: extent.height + PLACEMENT_PADDING * 2,
  };
}

// The reference's `candidateAspectScore`: how lopsided the workspace becomes if the section lands
// here, so growth stays roughly square instead of running off in one direction.
function getAspectScore(
  bounds: PlacementRect,
  candidate: Position,
  extent: PlacementExtent,
): number {
  const width =
    Math.max(bounds.x + bounds.w, candidate.x + extent.width) -
    Math.min(bounds.x, candidate.x);
  const height =
    Math.max(bounds.y + bounds.h, candidate.y + extent.height) -
    Math.min(bounds.y, candidate.y);
  if (width <= 0 || height <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(width, height) / Math.min(width, height);
}

function getFallbackPosition(rects: ReadonlyArray<PlacementRect>): Position {
  const first = rects[0];
  if (!first) {
    return { x: PLACEMENT_PADDING, y: PLACEMENT_PADDING };
  }
  let maxX = first.x + first.w;
  let minY = first.y;
  for (const rect of rects.slice(1)) {
    maxX = Math.max(maxX, rect.x + rect.w);
    minY = Math.min(minY, rect.y);
  }
  return { x: maxX + PLACEMENT_PADDING, y: minY };
}

function chooseAdjacentPosition(
  bounds: PlacementRect,
  rects: ReadonlyArray<PlacementRect>,
  extent: PlacementExtent,
  right: Position | null,
  bottom: Position | null,
): Position {
  if (!bottom) {
    return right ?? getFallbackPosition(rects);
  }
  if (!right) {
    return bottom;
  }
  const rightScore = getAspectScore(bounds, right, extent);
  const bottomScore = getAspectScore(bounds, bottom, extent);
  if (rightScore !== bottomScore) {
    return bottomScore < rightScore ? bottom : right;
  }
  return bounds.w < bounds.h ? right : bottom;
}

// The reference's `findPositionAfterExisting`: reuse a gap inside what the workspace already
// occupies, otherwise extend it on the side that keeps the workspace closest to square.
function findPositionAfterExisting(
  rects: ReadonlyArray<PlacementRect>,
  extent: PlacementExtent,
): Position {
  const bounds = getOccupiedBounds(rects);
  if (!bounds) {
    return { x: PLACEMENT_PADDING, y: PLACEMENT_PADDING };
  }
  const inside = findPositionInBounds(
    expandRect(bounds, PLACEMENT_PADDING),
    extent,
    rects,
  );
  if (inside) {
    return inside;
  }
  return chooseAdjacentPosition(
    bounds,
    rects,
    extent,
    findPositionInBounds(getRightBounds(bounds, extent), extent, rects),
    findPositionInBounds(getBottomBounds(bounds, extent), extent, rects),
  );
}

// The reference's `resolveCreateTopLevelSectionPanTarget`: the created section's own middle,
// pushed out to at least its minimum width so a wide section is framed by its leading edge.
function getPanTarget(
  position: Position,
  extent: PlacementExtent,
  minimum: PlacementExtent,
): Position {
  return {
    x: position.x + Math.max(extent.width / 2, minimum.width),
    y: position.y + extent.height / 2,
  };
}

export function resolveWorkspaceEmptySpacePlacement(
  host: WorkspaceHost,
  section: WorkspaceSectionInput,
): WorkspaceEmptySpacePlacement {
  const extent = resolveSectionExtent(host, section, {
    width: null,
    height: null,
  });
  const minimum = resolveMinimumExtent(host, section);
  const rects = buildOccupiedRects(host);
  const pane = getVisiblePaneRect(host);

  // Without a measurable canvas there is no "visible" to prefer, so the search falls straight
  // through to the workspace's own layout and the canvas stays where it is.
  if (!pane) {
    return Object.freeze({
      position: findPositionAfterExisting(rects, extent),
      panTo: null,
    });
  }
  // The reference's `shouldUseCreateTopLevelSectionViewport`: a pane looking at empty space far
  // from the workspace is not where new sections belong — they join the workspace, and the canvas
  // travels to them.
  if (rects.length > 0 && !intersectsAny(pane, rects)) {
    const position = findPositionAfterExisting(rects, extent);
    return Object.freeze({
      position,
      panTo: getPanTarget(position, extent, minimum),
    });
  }
  const visible = findPositionInBounds(pane, extent, rects);
  if (visible) {
    return Object.freeze({ position: visible, panTo: null });
  }
  const adjacent =
    findPositionInBounds(getRightBounds(pane, extent), extent, rects) ??
    findPositionInBounds(getBottomBounds(pane, extent), extent, rects) ??
    findPositionAfterExisting(rects, extent);
  return Object.freeze({
    position: adjacent,
    panTo: getPanTarget(adjacent, extent, minimum),
  });
}
