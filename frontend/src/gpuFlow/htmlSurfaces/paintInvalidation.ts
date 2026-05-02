export type HtmlSurfacePaintInvalidationInput = {
  readonly changedElements?: readonly Element[] | undefined;
  readonly sourceElementBySurfaceId: ReadonlyMap<string, HTMLElement>;
  readonly sourceIdAttribute: string;
  readonly sourceSelector: string;
  readonly surfaceSelector?: string | undefined;
  readonly transformOnlySourceIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
};

export type HtmlSurfacePaintInvalidationResult = {
  readonly dirtySurfaceInvalidations: readonly HtmlSurfacePaintSourceInvalidation[];
  readonly dirtySurfaceIds: readonly string[];
  readonly transformOnlyPaintSurfaceIds: readonly string[];
};

export type HtmlSurfacePaintSourceInvalidation = {
  readonly sourceRect?: HtmlSurfacePaintSourceRect | undefined;
  readonly surfaceId: string;
};

export type HtmlSurfacePaintSourceRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

type ChangedSourceResolution =
  | {
      readonly kind: "content";
      readonly sourceRect?: HtmlSurfacePaintSourceRect | undefined;
      readonly surfaceId: string;
    }
  | {
      readonly kind: "transform-only";
      readonly surfaceId: string;
    };

export function resolveHtmlSurfacePaintInvalidation({
  changedElements,
  sourceElementBySurfaceId,
  sourceIdAttribute,
  sourceSelector,
  surfaceSelector,
  transformOnlySourceIds,
}: HtmlSurfacePaintInvalidationInput): HtmlSurfacePaintInvalidationResult {
  const dirtySurfaceInvalidations: HtmlSurfacePaintSourceInvalidation[] = [];
  const dirtySurfaceIds = new Set<string>();
  const transformOnlyPaintSurfaceIds = new Set<string>();
  const transformOnlyIds = normalizeSurfaceIdSet(transformOnlySourceIds);

  if (!changedElements) {
    return {
      dirtySurfaceInvalidations: [],
      dirtySurfaceIds: [],
      transformOnlyPaintSurfaceIds: [],
    };
  }

  for (const changedElement of changedElements) {
    const resolution = resolveChangedSource({
      changedElement,
      sourceElementBySurfaceId,
      sourceIdAttribute,
      sourceSelector,
      surfaceSelector,
      transformOnlyIds,
    });
    if (!resolution) {
      continue;
    }
    if (resolution.kind === "transform-only") {
      transformOnlyPaintSurfaceIds.add(resolution.surfaceId);
      continue;
    }
    dirtySurfaceInvalidations.push({
      ...(resolution.sourceRect ? { sourceRect: resolution.sourceRect } : {}),
      surfaceId: resolution.surfaceId,
    });
    dirtySurfaceIds.add(resolution.surfaceId);
  }

  return {
    dirtySurfaceInvalidations,
    dirtySurfaceIds: [...dirtySurfaceIds],
    transformOnlyPaintSurfaceIds: [...transformOnlyPaintSurfaceIds],
  };
}

function resolveChangedSource({
  changedElement,
  sourceElementBySurfaceId,
  sourceIdAttribute,
  sourceSelector,
  surfaceSelector,
  transformOnlyIds,
}: {
  readonly changedElement: Element;
  readonly sourceElementBySurfaceId: ReadonlyMap<string, HTMLElement>;
  readonly sourceIdAttribute: string;
  readonly sourceSelector: string;
  readonly surfaceSelector: string | undefined;
  readonly transformOnlyIds: ReadonlySet<string>;
}): ChangedSourceResolution | null {
  const nearestSourceElement =
    changedElement.closest<HTMLElement>(sourceSelector);
  const nearestSourceId =
    nearestSourceElement?.getAttribute(sourceIdAttribute) ?? null;
  if (
    nearestSourceId &&
    sourceElementBySurfaceId.get(nearestSourceId) === nearestSourceElement
  ) {
    if (
      changedElement === nearestSourceElement &&
      transformOnlyIds.has(nearestSourceId)
    ) {
      return {
        kind: "transform-only",
        surfaceId: nearestSourceId,
      };
    }
    return {
      kind: "content",
      sourceRect: resolveChangedElementSourceRect({
        changedElement,
        sourceElement: nearestSourceElement,
      }),
      surfaceId: nearestSourceId,
    };
  }

  const containedSourceId = findSingleContainedSourceId({
    changedElement,
    sourceElementBySurfaceId,
    sourceIdAttribute,
    sourceSelector,
    surfaceSelector,
  });
  return containedSourceId
    ? {
        kind: "content",
        surfaceId: containedSourceId,
      }
    : null;
}

function resolveChangedElementSourceRect({
  changedElement,
  sourceElement,
}: {
  readonly changedElement: Element;
  readonly sourceElement: HTMLElement;
}): HtmlSurfacePaintSourceRect | undefined {
  if (changedElement === sourceElement) {
    return undefined;
  }

  const changedRect = changedElement.getBoundingClientRect();
  const sourceRect = sourceElement.getBoundingClientRect();
  if (!hasFiniteSourceRectInputs(changedRect, sourceRect)) {
    return undefined;
  }

  const left = Math.max(0, changedRect.left - sourceRect.left);
  const top = Math.max(0, changedRect.top - sourceRect.top);
  const right = resolveChangedRectEnd({
    axisSize: sourceRect.width,
    changedEnd: changedRect.right,
    sourceStart: sourceRect.left,
  });
  const bottom = resolveChangedRectEnd({
    axisSize: sourceRect.height,
    changedEnd: changedRect.bottom,
    sourceStart: sourceRect.top,
  });
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return {
    height,
    width,
    x: left,
    y: top,
  };
}

function hasFiniteSourceRectInputs(
  changedRect: DOMRect,
  sourceRect: DOMRect,
): boolean {
  return [
    changedRect.left,
    changedRect.top,
    changedRect.right,
    changedRect.bottom,
    sourceRect.left,
    sourceRect.top,
  ].every(Number.isFinite);
}

function resolveChangedRectEnd({
  axisSize,
  changedEnd,
  sourceStart,
}: {
  readonly axisSize: number;
  readonly changedEnd: number;
  readonly sourceStart: number;
}): number {
  const relativeEnd = changedEnd - sourceStart;
  return axisSize > 0 ? Math.min(axisSize, relativeEnd) : relativeEnd;
}

function findSingleContainedSourceId({
  changedElement,
  sourceElementBySurfaceId,
  sourceIdAttribute,
  sourceSelector,
  surfaceSelector,
}: {
  readonly changedElement: Element;
  readonly sourceElementBySurfaceId: ReadonlyMap<string, HTMLElement>;
  readonly sourceIdAttribute: string;
  readonly sourceSelector: string;
  readonly surfaceSelector: string | undefined;
}): string | null {
  if (surfaceSelector && changedElement.matches(surfaceSelector)) {
    return null;
  }

  // html-in-canvas can report an enclosing changed subtree instead of the
  // exact source. Accept that fallback only when the subtree contains exactly
  // one registered source, so a canvas/surface paint cannot dirty everything.
  let containedSourceId: string | null = null;
  for (const sourceElement of changedElement.querySelectorAll<HTMLElement>(
    sourceSelector,
  )) {
    const sourceId = sourceElement.getAttribute(sourceIdAttribute);
    if (!sourceId || sourceElementBySurfaceId.get(sourceId) !== sourceElement) {
      continue;
    }
    if (containedSourceId && containedSourceId !== sourceId) {
      return null;
    }
    containedSourceId = sourceId;
  }
  return containedSourceId;
}

function normalizeSurfaceIdSet(
  surfaceIds: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  if (!surfaceIds) {
    return new Set();
  }
  if (surfaceIds instanceof Set) {
    return surfaceIds;
  }
  return new Set(surfaceIds);
}
