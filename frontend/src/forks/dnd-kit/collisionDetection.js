// Some functions borrowed from https://github.com/clauderic/dnd-kit/blob/master/packages/core/src/utilities/algorithms

import { getSectionInfo } from "state/getters/sectionInfo";
import { isTempSection, sourceOfTempSection } from "./dndState";

function compareCollisions(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }

  // When comparing two nested sections, first check if they are left-aligned.
  // If they are not left-aligned, then prioritize the section that has the smallest left distance.
  // If they are left-aligned, then prioritize the section with most intersection.
  const cidA = a.data.droppableContainer.data.current.sortable?.containerId;
  const cidB = b.data.droppableContainer.data.current.sortable?.containerId;
  // sortable A prioritized before non-sortable B
  if (cidA && !cidB) {
    return a;
  }
  // sortable B prioritized before non-sortable A
  if (!cidA && cidB) {
    return b;
  }

  const ra = a.data.intersectionRatio;
  const rb = b.data.intersectionRatio;

  if (cidA && cidB) {
    const la = a.data.absLeftDist;
    const lb = b.data.absLeftDist;
    const rawLa = a.data.leftDist;
    const rawLb = b.data.leftDist;
    // if left-aligned, return rect with larger intersection
    if (la - lb === 0) {
      return rb - ra > 0 ? b : a;
    }
    // if the active rect is to the right of both rects, then return the one that has the closest left edge
    if (rawLa > 0 && rawLb > 0) {
      return la - lb > 0 ? b : a;
    }
    // if b's left edge is closer than a's left edge
    // and the active rect is to the left of b, then return b
    if (la - lb > 0) {
      return rawLb < 0 ? b : a;
    }
    // if a's left edge is closer than b's left edge
    // and the active rect is to the left of a, then return a
    if (lb - la > 0) {
      return rawLa < 0 ? a : b;
    }
  }
  // for two non-sortables, use intersection area
  return rb - ra > 0 ? b : a;
}

function getIntersectionRatio(entry, target) {
  const top = Math.max(target.top, entry.top);
  const left = Math.max(target.left, entry.left);
  const right = Math.min(target.left + target.width, entry.left + entry.width);
  const bottom = Math.min(target.top + target.height, entry.top + entry.height);
  const width = right - left;
  const height = bottom - top;

  if (left < right && top < bottom) {
    // const targetArea = target.width * target.height;
    // const entryArea = entry.width * entry.height;
    const intersectionArea = width * height;
    // const intersectionRatio =
    // intersectionArea / (targetArea + entryArea - intersectionArea);

    return Number(intersectionArea.toFixed(4));
  }

  // Rectangles do not overlap, or overlap has an area of zero (edge/corner overlap)
  return 0;
}

function compareCollisionsForSorting(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }

  return a.data.effectiveDistance < b.data.effectiveDistance ? a : b;
}

function distanceBetween(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function cornersOfRectangle({ left, top, height, width }) {
  return [
    {
      x: left,
      y: top,
    },
    {
      x: left + width,
      y: top,
    },
    {
      x: left,
      y: top + height,
    },
    {
      x: left + width,
      y: top + height,
    },
  ];
}

function getBestCollisionSortable(
  id,
  corners,
  rect,
  bestCollisionSortable,
  droppableContainer,
) {
  const rectCorners = cornersOfRectangle(rect);
  const distances = corners.reduce((accumulator, corner, index) => {
    return accumulator + distanceBetween(rectCorners[index], corner);
  }, 0);
  const effectiveDistance = Number((distances / 4).toFixed(4));
  return compareCollisionsForSorting(bestCollisionSortable, {
    id,
    data: {
      droppableContainer,
      effectiveDistance,
    },
  });
}

export function getCustomCollisionDetection(isSorting) {
  return ({ active, collisionRect, droppableRects, droppableContainers }) => {
    if (isSorting && !active.data.current.sortable) {
      return { bestCollision: [], bestCollisionSortable: [] };
    }

    let bestCollision = null;
    let bestCollisionSortable = null;
    const left = collisionRect.left;
    const corners = cornersOfRectangle(collisionRect);

    for (const droppableContainer of droppableContainers) {
      const { id } = droppableContainer;
      const rect = droppableRects.get(id);
      if (!rect) {
        continue;
      }

      if (!isSorting) {
        // If active doesn't have a parent, then don't look for overlap with self.
        if (active.data.current.sortable?.containerId || active.id !== id) {
          const ratio = getIntersectionRatio(rect, collisionRect);
          if (ratio) {
            const dist = left - rect.left;
            bestCollision = compareCollisions(bestCollision, {
              id,
              data: {
                droppableContainer,
                absLeftDist: Math.abs(dist),
                leftDist: dist,
                intersectionRatio: ratio,
              },
            });
            bestCollisionSortable = getBestCollisionSortable(
              id,
              corners,
              rect,
              bestCollisionSortable,
              droppableContainer,
            );
          }
        }
      } else {
        if (
          active.data.current.sortable.containerId ===
          droppableContainer.data.current.sortable?.containerId
        ) {
          bestCollisionSortable = getBestCollisionSortable(
            id,
            corners,
            rect,
            bestCollisionSortable,
            droppableContainer,
          );
        }
      }
    }

    if (bestCollision) {
      const _isTempSection = isTempSection(bestCollision.id);
      const id = _isTempSection
        ? sourceOfTempSection(bestCollision.id)
        : bestCollision.id;
      console.log(
        "bestCollision",
        `${getSectionInfo(id).name}${_isTempSection ? "TEMP" : ""}`,
      );
    }

    if (bestCollisionSortable) {
      const _isTempSection = isTempSection(bestCollisionSortable.id);
      const id = _isTempSection
        ? sourceOfTempSection(bestCollisionSortable.id)
        : bestCollisionSortable.id;
      console.log(
        "bestCollisionSortable",
        `${getSectionInfo(id).name}${_isTempSection ? "TEMP" : ""}`,
      );
    }

    return {
      bestCollision: bestCollision ? [bestCollision] : [],
      bestCollisionSortable: bestCollisionSortable
        ? [bestCollisionSortable]
        : [],
    };
  };
}
