import {
  createGpuFlowContentSurfacesFromSections,
  type GpuFlowScene,
  type GpuSectionSceneNode,
} from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

export function resolveGpuFlowSceneLayout(scene: GpuFlowScene): GpuFlowScene {
  const sections = resolveGpuFlowSectionSceneLayout(scene.sections);
  return {
    ...scene,
    contentSurfaces: createGpuFlowContentSurfacesFromSections(
      sections,
      scene.contentSurfaces,
    ),
    sections,
  };
}

export function resolveGpuFlowSectionSceneLayout(
  sections: readonly GpuSectionSceneNode[],
): readonly GpuSectionSceneNode[] {
  const sectionById = createGpuSectionSceneNodeMap(sections);
  validateGpuSectionSceneTree(sections, sectionById);

  const resolvedById = new Map<string, GpuSectionSceneNode>();
  const visitingSectionIds = new Set<string>();
  for (const section of sections) {
    if (section.parentSectionId === null) {
      resolveGpuSectionSceneSubtree({
        section,
        sectionById,
        resolvedById,
        visitingSectionIds,
      });
    }
  }

  return sections.map((section) => {
    const resolved = resolvedById.get(section.sectionId);
    if (!resolved) {
      throw new Error(`Unresolved section scene node ${section.sectionId}.`);
    }
    return resolved;
  });
}

function resolveGpuSectionSceneSubtree({
  parentContext,
  resolvedById,
  section,
  sectionById,
  visitingSectionIds,
}: {
  readonly parentContext?:
    | {
        readonly localRect: GpuRect;
        readonly parentClipRect: GpuRect;
        readonly worldRect: GpuRect;
      }
    | undefined;
  readonly resolvedById: Map<string, GpuSectionSceneNode>;
  readonly section: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly visitingSectionIds: Set<string>;
}): GpuSectionSceneNode {
  if (visitingSectionIds.has(section.sectionId)) {
    throw new Error(`Cycle in section scene tree at ${section.sectionId}.`);
  }
  const existing = resolvedById.get(section.sectionId);
  if (existing) {
    return existing;
  }

  visitingSectionIds.add(section.sectionId);
  const resolvedSection = resolveGpuSectionSceneNodeGeometry(
    section,
    parentContext,
  );
  resolvedById.set(section.sectionId, resolvedSection);
  resolveGpuSectionSceneChildren({
    resolvedById,
    resolvedSection,
    sectionById,
    visitingSectionIds,
  });
  visitingSectionIds.delete(section.sectionId);
  return resolvedSection;
}

function resolveGpuSectionSceneNodeGeometry(
  section: GpuSectionSceneNode,
  parentContext:
    | {
        readonly localRect: GpuRect;
        readonly parentClipRect: GpuRect;
        readonly worldRect: GpuRect;
      }
    | undefined,
): GpuSectionSceneNode {
  const localRect = parentContext?.localRect ?? section.localRect;
  const worldRect = parentContext?.worldRect ?? section.worldRect;
  return applyGpuSectionSceneGeometry(section, {
    clipRect: parentContext
      ? intersectGpuRects(worldRect, parentContext.parentClipRect)
      : section.clipRect,
    localRect,
    worldRect,
  });
}

function resolveGpuSectionSceneChildren({
  resolvedById,
  resolvedSection,
  sectionById,
  visitingSectionIds,
}: {
  readonly resolvedById: Map<string, GpuSectionSceneNode>;
  readonly resolvedSection: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly visitingSectionIds: Set<string>;
}) {
  const childViewportRect =
    resolvedSection.childViewportRect ?? resolvedSection.bodyRect;
  const childClipRect = intersectGpuRects(
    resolvedSection.clipRect,
    childViewportRect,
  );
  let previousChildLocalRect: GpuRect | null = null;
  for (const childSectionId of resolvedSection.childSectionIds) {
    const child = sectionById.get(childSectionId);
    if (!child) {
      throw new Error(`Missing section scene child ${childSectionId}.`);
    }
    const childLocalRect = resolveGpuSectionSceneChildLocalRect({
      child,
      parent: resolvedSection,
      previousChildLocalRect,
    });
    previousChildLocalRect = childLocalRect;
    const childWorldRect = translateGpuRect(childLocalRect, {
      x: childViewportRect.x - resolvedSection.scrollOffset.x,
      y: childViewportRect.y - resolvedSection.scrollOffset.y,
    });
    resolveGpuSectionSceneSubtree({
      parentContext: {
        localRect: childLocalRect,
        parentClipRect: childClipRect,
        worldRect: childWorldRect,
      },
      resolvedById,
      section: child,
      sectionById,
      visitingSectionIds,
    });
  }
}

function createGpuSectionSceneNodeMap(
  sections: readonly GpuSectionSceneNode[],
): ReadonlyMap<string, GpuSectionSceneNode> {
  const sectionById = new Map<string, GpuSectionSceneNode>();
  for (const section of sections) {
    if (sectionById.has(section.sectionId)) {
      throw new Error(`Duplicate section scene node ${section.sectionId}.`);
    }
    sectionById.set(section.sectionId, section);
  }
  return sectionById;
}

function validateGpuSectionSceneTree(
  sections: readonly GpuSectionSceneNode[],
  sectionById: ReadonlyMap<string, GpuSectionSceneNode>,
) {
  const parentIdByChildId = collectGpuSectionSceneChildParents(
    sections,
    sectionById,
  );
  validateGpuSectionSceneRootCount(sections);
  validateGpuSectionSceneParentOrder(sections, parentIdByChildId);
}

function collectGpuSectionSceneChildParents(
  sections: readonly GpuSectionSceneNode[],
  sectionById: ReadonlyMap<string, GpuSectionSceneNode>,
): ReadonlyMap<string, string> {
  const parentIdByChildId = new Map<string, string>();
  for (const section of sections) {
    validateGpuSectionSceneParentExists(section, sectionById);
    collectGpuSectionSceneChildParentIds({
      parentIdByChildId,
      section,
      sectionById,
    });
  }
  return parentIdByChildId;
}

function validateGpuSectionSceneParentExists(
  section: GpuSectionSceneNode,
  sectionById: ReadonlyMap<string, GpuSectionSceneNode>,
) {
  if (
    section.parentSectionId !== null &&
    !sectionById.has(section.parentSectionId)
  ) {
    throw new Error(
      `Missing parent section scene node ${section.parentSectionId} for ${section.sectionId}.`,
    );
  }
}

function collectGpuSectionSceneChildParentIds({
  parentIdByChildId,
  section,
  sectionById,
}: {
  readonly parentIdByChildId: Map<string, string>;
  readonly section: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
}) {
  const seenChildIds = new Set<string>();
  for (const childSectionId of section.childSectionIds) {
    validateGpuSectionSceneChildId({
      childSectionId,
      parentIdByChildId,
      section,
      sectionById,
      seenChildIds,
    });
    seenChildIds.add(childSectionId);
    parentIdByChildId.set(childSectionId, section.sectionId);
  }
}

function validateGpuSectionSceneChildId({
  childSectionId,
  parentIdByChildId,
  section,
  sectionById,
  seenChildIds,
}: {
  readonly childSectionId: string;
  readonly parentIdByChildId: ReadonlyMap<string, string>;
  readonly section: GpuSectionSceneNode;
  readonly sectionById: ReadonlyMap<string, GpuSectionSceneNode>;
  readonly seenChildIds: ReadonlySet<string>;
}) {
  if (seenChildIds.has(childSectionId)) {
    throw new Error(
      `Duplicate child section scene node ${childSectionId} under ${section.sectionId}.`,
    );
  }
  if (!sectionById.has(childSectionId)) {
    throw new Error(
      `Missing section scene child ${childSectionId} under ${section.sectionId}.`,
    );
  }
  const previousParentId = parentIdByChildId.get(childSectionId);
  if (previousParentId && previousParentId !== section.sectionId) {
    throw new Error(
      `Section scene child ${childSectionId} is listed under both ${previousParentId} and ${section.sectionId}.`,
    );
  }
}

function validateGpuSectionSceneRootCount(
  sections: readonly GpuSectionSceneNode[],
) {
  if (
    sections.length > 0 &&
    !sections.some((section) => section.parentSectionId === null)
  ) {
    throw new Error("Section scene must include at least one root section.");
  }
}

function validateGpuSectionSceneParentOrder(
  sections: readonly GpuSectionSceneNode[],
  parentIdByChildId: ReadonlyMap<string, string>,
) {
  for (const section of sections) {
    if (section.parentSectionId === null) {
      validateGpuSectionSceneRootOrder(section, parentIdByChildId);
      continue;
    }
    validateGpuSectionSceneChildOrder(section, parentIdByChildId);
  }
}

function validateGpuSectionSceneRootOrder(
  section: GpuSectionSceneNode,
  parentIdByChildId: ReadonlyMap<string, string>,
) {
  if (parentIdByChildId.has(section.sectionId)) {
    throw new Error(
      `Root section scene node ${section.sectionId} is also listed as a child.`,
    );
  }
}

function validateGpuSectionSceneChildOrder(
  section: GpuSectionSceneNode,
  parentIdByChildId: ReadonlyMap<string, string>,
) {
  const orderedParentId = parentIdByChildId.get(section.sectionId);
  if (orderedParentId !== section.parentSectionId) {
    throw new Error(
      `Section scene node ${section.sectionId} is parented to ${section.parentSectionId} but is not listed in that parent's child order.`,
    );
  }
}

function resolveGpuSectionSceneChildLocalRect({
  child,
  parent,
  previousChildLocalRect,
}: {
  readonly child: GpuSectionSceneNode;
  readonly parent: GpuSectionSceneNode;
  readonly previousChildLocalRect: GpuRect | null;
}): GpuRect {
  if (parent.layoutMode === "horizontal" || parent.layoutMode === "kanban") {
    return {
      ...child.localRect,
      x: previousChildLocalRect
        ? previousChildLocalRect.x +
          previousChildLocalRect.width +
          parent.childLayout.gap.x
        : child.localRect.x,
    };
  }

  if (parent.layoutMode === "vertical") {
    return {
      ...child.localRect,
      y: previousChildLocalRect
        ? previousChildLocalRect.y +
          previousChildLocalRect.height +
          parent.childLayout.gap.y
        : child.localRect.y,
    };
  }

  return child.localRect;
}

function applyGpuSectionSceneGeometry(
  section: GpuSectionSceneNode,
  {
    clipRect,
    localRect,
    worldRect,
  }: {
    readonly clipRect: GpuRect;
    readonly localRect: GpuRect;
    readonly worldRect: GpuRect;
  },
): GpuSectionSceneNode {
  const bodyRect = translateGpuRectRelativeToReference(
    section.bodyRect,
    section.worldRect,
    worldRect,
  );
  const chromeRect = translateGpuRectRelativeToReference(
    section.chromeRect,
    section.worldRect,
    worldRect,
  );
  const childViewportRect =
    section.childSectionIds.length === 0
      ? null
      : section.childViewportRect
        ? translateGpuRectRelativeToReference(
            section.childViewportRect,
            section.worldRect,
            worldRect,
          )
        : bodyRect;

  return {
    ...section,
    ...(section.parentSectionId === null
      ? {}
      : {
          height: localRect.height,
          width: localRect.width,
        }),
    bodyRect,
    childViewportRect,
    chromeRect,
    clipRect,
    localRect,
    worldRect,
    x: worldRect.x,
    y: worldRect.y,
  };
}

function translateGpuRect(rect: GpuRect, origin: GpuPoint): GpuRect {
  return {
    height: rect.height,
    width: rect.width,
    x: origin.x + rect.x,
    y: origin.y + rect.y,
  };
}

function translateGpuRectRelativeToReference(
  rect: GpuRect,
  previousReference: GpuRect,
  nextReference: GpuRect,
): GpuRect {
  return {
    height: rect.height,
    width: rect.width,
    x: nextReference.x + (rect.x - previousReference.x),
    y: nextReference.y + (rect.y - previousReference.y),
  };
}

function intersectGpuRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(maxY - y, 0),
    width: Math.max(maxX - x, 0),
    x,
    y,
  };
}
