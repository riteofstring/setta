import {
  screenToFlowPosition,
  setCenter,
  getZoom,
} from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { Node } from "forks/xyflow/core/types/nodes";
import {
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_create_top_level_section } from "utils/generatedEndpoints";
import { Position, SectionType, SectionTypeEnum } from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { setActiveSectionIdAndUpdateZIndex } from "../activeSections";
import { getCurrProjectConfigId } from "../sectionInfos";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SizeHint = {
  width: number;
  height: number;
};

export type EmptySpacePlacement = {
  position: Position;
  centerOn: Position;
  shouldPan: boolean;
  size: SizeHint;
  viewRect: Rect | null;
};

export type EmptySpaceOptions = {
  sizeHint?: SizeHint;
  allowOutOfView?: boolean;
};

const DEFAULT_SECTION_SIZE: SizeHint = { width: 420, height: 260 };
const LEGACY_OFFSET: Position = { x: 10, y: 10 };
const PLACEMENT_PADDING = 16;
const PLACEMENT_STEP = 40;
const OUTSIDE_VIEW_PADDING = 140;
const PAN_DURATION_MS = 200;
const PENDING_PLACEMENT_TTL_MS = 6000;
const PAN_CHECK_ATTEMPTS = 12;
const PAN_CHECK_DELAY_MS = 80;

type PendingPlacement = {
  rect: Rect;
  expiresAt: number;
};

const pendingPlacements: PendingPlacement[] = [];

async function addSectionInEmptySpace(
  type: SectionType,
  callback?: (x: string) => void,
) {
  const placement = getEmptySpacePlacement({ allowOutOfView: true });
  reservePlacement(placement);
  const res = await route_create_top_level_section({
    projectConfigId: getCurrProjectConfigId(),
    implType: type,
    implOverrides: null,
    position: placement.position,
    viewRect: placement.viewRect,
  });

  if (res200(res)) {
    const newId = res.data;
    callback?.(newId);
    panToSectionIfNeeded(newId);
  }
}

export function addCallableSectionInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Callable, (newId) => {
    setActiveSectionIdAndUpdateZIndex(newId);
    focusOnSectionSearch(newId);
  });
}

export function addGroupInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Group, (newId) => {
    setActiveSectionIdAndUpdateZIndex(newId);
  });
}

export function addTerminalInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Terminal);
}

export function getEmptySpacePlacement(
  options: EmptySpaceOptions = {},
): EmptySpacePlacement {
  const viewRect = getViewportRectForPlacement();
  const pendingRects = getPendingPlacementRects();
  const baseOccupiedRects = getTopLevelSectionRects();
  const placementSize = getPlacementSizeHint(
    options.sizeHint,
    viewRect,
    [...baseOccupiedRects, ...pendingRects],
  );
  const occupiedRects = [
    ...getTopLevelSectionRectsWithFallback(placementSize),
    ...pendingRects,
  ];

  if (!viewRect) {
    const fallbackPosition = getLegacyEmptySpacePosition();
    return {
      position: fallbackPosition,
      centerOn: getCenterForPosition(fallbackPosition, placementSize),
      shouldPan: false,
      size: placementSize,
      viewRect,
    };
  }

  const preferredAnchor = getPreferredAnchor(viewRect);
  const candidate = findAvailablePosition(
    viewRect,
    placementSize,
    occupiedRects,
    preferredAnchor,
  );

  if (candidate) {
    return {
      position: candidate,
      centerOn: getCenterForPosition(candidate, placementSize),
      shouldPan: false,
      size: placementSize,
      viewRect,
    };
  }

  if (options.allowOutOfView) {
    const expandedRect = expandRect(viewRect, OUTSIDE_VIEW_PADDING);
    const outOfViewCandidate = findAvailablePosition(
      expandedRect,
      placementSize,
      occupiedRects,
      preferredAnchor,
    );
    if (outOfViewCandidate) {
      const candidateRect = toRect(outOfViewCandidate, placementSize);
      return {
        position: outOfViewCandidate,
        centerOn: getCenterForPosition(outOfViewCandidate, placementSize),
        shouldPan: !rectContains(viewRect, candidateRect),
        size: placementSize,
        viewRect,
      };
    }
  }

  const fallbackPosition = getLegacyEmptySpacePosition();
  return {
    position: fallbackPosition,
    centerOn: getCenterForPosition(fallbackPosition, placementSize),
    shouldPan: false,
    size: placementSize,
    viewRect,
  };
}

export function panToSectionIfNeeded(sectionId: string) {
  schedulePanToSection(sectionId, PAN_CHECK_ATTEMPTS);
}

export function getEmptySpacePosition(options: EmptySpaceOptions = {}) {
  return getEmptySpacePlacement(options).position;
}

export function reservePlacement(placement: EmptySpacePlacement) {
  const rect = toRect(placement.position, placement.size);
  const now = Date.now();
  pendingPlacements.push({ rect, expiresAt: now + PENDING_PLACEMENT_TTL_MS });
  prunePendingPlacements(now);
}

function getPlacementSizeHint(
  sizeHint: SizeHint | undefined,
  viewRect: Rect | null,
  occupiedRects: Rect[],
): SizeHint {
  if (sizeHint) {
    return sizeHint;
  }

  if (viewRect) {
    const visibleRects = occupiedRects.filter((rect) =>
      rectsOverlap(rect, viewRect),
    );
    const medianVisible = getMedianRectSize(visibleRects);
    if (medianVisible) {
      return medianVisible;
    }
  }

  const medianAll = getMedianRectSize(occupiedRects);
  if (medianAll) {
    return medianAll;
  }

  return DEFAULT_SECTION_SIZE;
}

export function getViewportRectForPlacement(): Rect | null {
  const { domNode } = useReactFlow.getState();
  if (!domNode) {
    return null;
  }
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;
  const uiEditorWidth = useLocalStorage.getState().uiEditorTrueWidth;
  const domRect = domNode.getBoundingClientRect();
  const left = domRect.left + overviewWidth;
  const right = domRect.right - uiEditorWidth;
  const top = domRect.top;
  const bottom = domRect.bottom;

  if (right <= left || bottom <= top) {
    return null;
  }

  const topLeft = screenToFlowPosition({ x: left, y: top }, true);
  const bottomRight = screenToFlowPosition({ x: right, y: bottom }, true);
  const viewWidth = bottomRight.x - topLeft.x;
  const viewHeight = bottomRight.y - topLeft.y;

  if (viewWidth <= 0 || viewHeight <= 0) {
    return null;
  }

  return { x: topLeft.x, y: topLeft.y, width: viewWidth, height: viewHeight };
}

function getLegacyEmptySpacePosition(): Position {
  const viewRect = getViewportRectForPlacement();
  if (viewRect) {
    return {
      x: viewRect.x + LEGACY_OFFSET.x,
      y: viewRect.y + LEGACY_OFFSET.y,
    };
  }

  const {
    transform: [_x, _y, zoom],
  } = useReactFlow.getState();
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;

  const x = (overviewWidth - _x) / zoom;
  const y = -_y / zoom;

  return { x: x + LEGACY_OFFSET.x, y: y + LEGACY_OFFSET.y };
}

function getTopLevelSectionRects(): Rect[] {
  return getTopLevelSectionRectsWithFallback(DEFAULT_SECTION_SIZE);
}

function getTopLevelSectionRectsWithFallback(fallbackSize: SizeHint): Rect[] {
  const topLevelSections = useProjectState.getState().projectConfig
    .topLevelSections;
  const nodes = useNodeInternals.getState().x;
  const rects: Rect[] = [];

  for (const sectionId of Object.keys(topLevelSections)) {
    const node = nodes.get(sectionId);
    if (!node) {
      continue;
    }
    const rect = nodeToRect(node, fallbackSize);
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    rects.push(rect);
  }

  return rects;
}

function getPendingPlacementRects(): Rect[] {
  prunePendingPlacements(Date.now());
  return pendingPlacements.map((placement) => placement.rect);
}

function prunePendingPlacements(now: number) {
  let index = 0;
  while (index < pendingPlacements.length) {
    if (pendingPlacements[index].expiresAt <= now) {
      pendingPlacements.splice(index, 1);
      continue;
    }
    index += 1;
  }
}

function schedulePanToSection(sectionId: string, attemptsLeft: number) {
  if (attemptsLeft <= 0) {
    return;
  }
  const viewRect = getViewportRectForPlacement();
  if (!viewRect) {
    setTimeout(() => {
      schedulePanToSection(sectionId, attemptsLeft - 1);
    }, PAN_CHECK_DELAY_MS);
    return;
  }
  const sectionRect = getSectionRect(sectionId, true);
  if (!sectionRect) {
    setTimeout(() => {
      schedulePanToSection(sectionId, attemptsLeft - 1);
    }, PAN_CHECK_DELAY_MS);
    return;
  }

  if (!rectContains(viewRect, sectionRect)) {
    const center = getCenterForPosition(sectionRect, {
      width: sectionRect.width,
      height: sectionRect.height,
    });
    setCenter(center.x, center.y, {
      zoom: getZoom(),
      duration: PAN_DURATION_MS,
    });
  }
}

function nodeToRect(node: Node, fallbackSize: SizeHint): Rect {
  const width = node.width ?? fallbackSize.width;
  const height = node.height ?? fallbackSize.height;
  return {
    x: node.position.x,
    y: node.position.y,
    width,
    height,
  };
}

function getPreferredAnchor(viewRect: Rect): Position {
  const lastClick = useMisc.getState().lastPaneClickLocation;
  if (isPointInRect(lastClick, viewRect)) {
    return lastClick;
  }
  return {
    x: viewRect.x + viewRect.width / 2,
    y: viewRect.y + viewRect.height / 2,
  };
}

function findAvailablePosition(
  searchRect: Rect,
  size: SizeHint,
  occupiedRects: Rect[],
  preferred: Position,
): Position | null {
  const minX = searchRect.x + PLACEMENT_PADDING;
  const minY = searchRect.y + PLACEMENT_PADDING;
  const maxX = searchRect.x + searchRect.width - size.width - PLACEMENT_PADDING;
  const maxY = searchRect.y + searchRect.height - size.height - PLACEMENT_PADDING;

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const candidates: Position[] = [];

  for (let y = minY; y <= maxY; y += PLACEMENT_STEP) {
    for (let x = minX; x <= maxX; x += PLACEMENT_STEP) {
      candidates.push({ x, y });
    }
  }

  candidates.sort((a, b) => {
    const distA = distanceSquared(getCenterForPosition(a, size), preferred);
    const distB = distanceSquared(getCenterForPosition(b, size), preferred);
    return distA - distB;
  });

  for (const candidate of candidates) {
    const candidateRect = toRect(candidate, size);
    if (!isRectBlocked(candidateRect, occupiedRects)) {
      return candidate;
    }
  }

  return null;
}

function getCenterForPosition(position: Position, size: SizeHint): Position {
  return {
    x: position.x + size.width / 2,
    y: position.y + size.height / 2,
  };
}

function toRect(position: Position, size: SizeHint): Rect {
  return { x: position.x, y: position.y, width: size.width, height: size.height };
}

function isRectBlocked(candidate: Rect, occupiedRects: Rect[]): boolean {
  for (const rect of occupiedRects) {
    const padded = expandRect(rect, PLACEMENT_PADDING);
    if (rectsOverlap(candidate, padded)) {
      return true;
    }
  }
  return false;
}

function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function rectContains(container: Rect, target: Rect): boolean {
  return (
    target.x >= container.x &&
    target.y >= container.y &&
    target.x + target.width <= container.x + container.width &&
    target.y + target.height <= container.y + container.height
  );
}

function isPointInRect(point: Position, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function distanceSquared(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function getMedianRectSize(rects: Rect[]): SizeHint | null {
  if (rects.length === 0) {
    return null;
  }

  const widths = rects.map((rect) => rect.width).sort((a, b) => a - b);
  const heights = rects.map((rect) => rect.height).sort((a, b) => a - b);
  const mid = Math.floor(widths.length / 2);

  return { width: widths[mid], height: heights[mid] };
}
