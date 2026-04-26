import {
  getCurrEffectiveSectionImpl,
  getSectionChildren,
} from "state/actions/sectionInfos";
import { isDescendantOfSectionSelection } from "state/actions/sections/sectionSelection";
import type { MoveSectionsInput } from "state/actions/sections/moveSections";
import { useProjectState } from "state/definitions";
import type { Position } from "utils/generatedTypes";

const SECTION_SELECTOR = "section[data-section-id]";
const SECTION_HEADER_SELECTOR = "header.section-title";

export type CanvasFlowClientPoint = {
  x: number;
  y: number;
};

export type CanvasFlowClientRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export type CanvasFlowNestedDragSource = {
  parentId: string;
  rect: CanvasFlowClientRect;
  sectionId: string;
};

export type CanvasFlowNestedDropTarget =
  | {
      kind: "nested-section";
      parentId: string;
      rect: CanvasFlowClientRect;
      sectionId: string;
    }
  | {
      kind: "parent-section";
      rect: CanvasFlowClientRect;
      sectionId: string;
    };

export function getCanvasFlowNestedDragSource({
  point,
  root,
}: {
  point: CanvasFlowClientPoint;
  root: ParentNode;
}): CanvasFlowNestedDragSource | null {
  const state = useProjectState.getState();
  return smallestSectionHit(
    getSectionElements(root).flatMap<CanvasFlowNestedDragSource>((section) => {
      const sectionId = getSectionElementId(section);
      if (!sectionId) {
        return [];
      }
      const parentId = state.parentSectionMap[sectionId] ?? null;
      if (!parentId) {
        return [];
      }
      const header = getOwnSectionHeader(section);
      if (!header || !pointInRect(point, header.getBoundingClientRect())) {
        return [];
      }
      return [
        {
          parentId,
          rect: toClientRect(section.getBoundingClientRect()),
          sectionId,
        },
      ];
    }),
  );
}

export function getCanvasFlowNestedDropTarget({
  point,
  root,
  sourceId,
}: {
  point: CanvasFlowClientPoint;
  root: ParentNode;
  sourceId: string;
}): CanvasFlowNestedDropTarget | null {
  const state = useProjectState.getState();
  return smallestSectionHit(
    getSectionElements(root).flatMap<CanvasFlowNestedDropTarget>((section) => {
      const sectionId = getSectionElementId(section);
      if (!sectionId || sectionId === sourceId) {
        return [];
      }
      const rect = section.getBoundingClientRect();
      if (!pointInRect(point, rect)) {
        return [];
      }
      const parentId = state.parentSectionMap[sectionId] ?? null;
      if (parentId) {
        return [
          {
            kind: "nested-section" as const,
            parentId,
            rect: toClientRect(rect),
            sectionId,
          },
        ];
      }
      if (!isParentSection(state, sectionId)) {
        return [];
      }
      return [
        {
          kind: "parent-section" as const,
          rect: toClientRect(rect),
          sectionId,
        },
      ];
    }),
  );
}

export function resolveCanvasFlowNestedDndDropPlan({
  dragEndPoint,
  dragStartPoint,
  draggingRectsById,
  sectionIds,
  target,
  toWorldPosition,
}: {
  dragEndPoint: CanvasFlowClientPoint;
  dragStartPoint: CanvasFlowClientPoint;
  draggingRectsById: Record<string, CanvasFlowClientRect>;
  sectionIds: string[];
  target: CanvasFlowNestedDropTarget | null;
  toWorldPosition: (position: Position) => Position;
}): MoveSectionsInput | null {
  if (sectionIds.length === 0) {
    return null;
  }
  if (target?.kind === "nested-section") {
    return resolveNestedSectionDropPlan({ dragEndPoint, sectionIds, target });
  }
  if (target?.kind === "parent-section") {
    return resolveParentSectionDropPlan({ sectionIds, target });
  }
  return resolvePaneDropPlan({
    dragEndPoint,
    dragStartPoint,
    draggingRectsById,
    sectionIds,
    toWorldPosition,
  });
}

export function getCanvasFlowNestedDndReorderIndex({
  children,
  pointerY,
  sectionIds,
  targetId,
  targetRect,
}: {
  children: string[];
  pointerY: number;
  sectionIds: string[];
  targetId: string;
  targetRect: CanvasFlowClientRect;
}): number | null {
  const draggingSet = new Set(sectionIds);
  const filteredChildren = children.filter((id) => !draggingSet.has(id));
  const overIndex = filteredChildren.indexOf(targetId);
  if (overIndex < 0) {
    return null;
  }
  const pastHalfway = pointerY > targetRect.top + targetRect.height / 2;
  return pastHalfway ? overIndex + 1 : overIndex;
}

function resolveNestedSectionDropPlan({
  dragEndPoint,
  sectionIds,
  target,
}: {
  dragEndPoint: CanvasFlowClientPoint;
  sectionIds: string[];
  target: Extract<CanvasFlowNestedDropTarget, { kind: "nested-section" }>;
}): MoveSectionsInput | null {
  const state = useProjectState.getState();
  if (
    isDescendantOfSectionSelection(
      state,
      target.parentId,
      new Set(sectionIds),
    )
  ) {
    return null;
  }
  const children = getSectionChildren(state, target.parentId) ?? [];
  const newIndex = getCanvasFlowNestedDndReorderIndex({
    children,
    pointerY: dragEndPoint.y,
    sectionIds,
    targetId: target.sectionId,
    targetRect: target.rect,
  });
  if (newIndex === null || isNoopChildMove(children, sectionIds, newIndex)) {
    return null;
  }
  return {
    sectionIds,
    newParentId: target.parentId,
    newIndex,
    positionsById: null,
  };
}

function resolveParentSectionDropPlan({
  sectionIds,
  target,
}: {
  sectionIds: string[];
  target: Extract<CanvasFlowNestedDropTarget, { kind: "parent-section" }>;
}): MoveSectionsInput | null {
  const state = useProjectState.getState();
  if (
    isDescendantOfSectionSelection(
      state,
      target.sectionId,
      new Set(sectionIds),
    )
  ) {
    return null;
  }
  const children = getSectionChildren(state, target.sectionId) ?? [];
  if (isNoopChildMove(children, sectionIds, children.length)) {
    return null;
  }
  return {
    sectionIds,
    newParentId: target.sectionId,
    newIndex: children.length,
    positionsById: null,
  };
}

function resolvePaneDropPlan({
  dragEndPoint,
  dragStartPoint,
  draggingRectsById,
  sectionIds,
  toWorldPosition,
}: {
  dragEndPoint: CanvasFlowClientPoint;
  dragStartPoint: CanvasFlowClientPoint;
  draggingRectsById: Record<string, CanvasFlowClientRect>;
  sectionIds: string[];
  toWorldPosition: (position: Position) => Position;
}): MoveSectionsInput | null {
  const delta = {
    x: dragEndPoint.x - dragStartPoint.x,
    y: dragEndPoint.y - dragStartPoint.y,
  };
  const positionsById: Record<string, Position> = {};
  for (const sectionId of sectionIds) {
    const rect = draggingRectsById[sectionId];
    if (!rect) {
      return null;
    }
    positionsById[sectionId] = toWorldPosition({
      x: rect.left + delta.x,
      y: rect.top + delta.y,
    });
  }
  return {
    sectionIds,
    newParentId: null,
    newIndex: 0,
    positionsById,
  };
}

function getSectionElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SECTION_SELECTOR));
}

function getSectionElementId(section: HTMLElement): string | null {
  return section.dataset.sectionId ?? null;
}

function getOwnSectionHeader(section: HTMLElement): HTMLElement | null {
  const headers = Array.from(
    section.querySelectorAll<HTMLElement>(SECTION_HEADER_SELECTOR),
  );
  return (
    headers.find((header) => header.closest(SECTION_SELECTOR) === section) ??
    null
  );
}

function isParentSection(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
): boolean {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  return "children" in impl && Array.isArray(impl.children);
}

function isNoopChildMove(
  children: string[],
  sectionIds: string[],
  newIndex: number,
): boolean {
  const draggingSet = new Set(sectionIds);
  const filteredChildren = children.filter((id) => !draggingSet.has(id));
  const nextChildren = [
    ...filteredChildren.slice(0, newIndex),
    ...sectionIds,
    ...filteredChildren.slice(newIndex),
  ];
  return arraysEqual(children, nextChildren);
}

function smallestSectionHit<T extends { rect: CanvasFlowClientRect }>(
  hits: T[],
): T | null {
  let smallest: T | null = null;
  let smallestArea = Number.POSITIVE_INFINITY;
  for (const hit of hits) {
    const area = hit.rect.width * hit.rect.height;
    if (area < smallestArea) {
      smallest = hit;
      smallestArea = area;
    }
  }
  return smallest;
}

function pointInRect(
  point: CanvasFlowClientPoint,
  rect: CanvasFlowClientRect | DOMRect,
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

function toClientRect(rect: DOMRect): CanvasFlowClientRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
