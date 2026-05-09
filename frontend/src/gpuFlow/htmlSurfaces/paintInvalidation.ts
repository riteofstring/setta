import {
  resolveElementSourceRect,
  type HtmlSurfaceSourceRect,
} from "./sourceRects";

import { resolveHtmlSurfaceDirectPaintSourceRectHint } from "./paintSourceRectHints";
import { HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE } from "./sourceDom";

type HtmlSurfacePaintInvalidationInput = {
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

type HtmlSurfacePaintInvalidationResult = {
  readonly dirtySurfaceInvalidations: readonly HtmlSurfacePaintSourceInvalidation[];
  readonly dirtySurfaceIds: readonly string[];
  readonly paintedSurfaceIds: readonly string[];
  readonly transformOnlyPaintSurfaceIds: readonly string[];
};

type HtmlSurfacePaintSourceInvalidation = {
  readonly sourceRect?: HtmlSurfacePaintSourceRect | undefined;
  readonly surfaceId: string;
};

type HtmlSurfacePaintSourceRect = HtmlSurfaceSourceRect;

type ChangedSourceResolution =
  | {
      readonly kind: "content";
      readonly sourceRect?: HtmlSurfacePaintSourceRect | undefined;
      readonly surfaceId: string;
    }
  | {
      readonly kind: "paint-only";
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
  const paintedSurfaceIds = new Set<string>();
  const transformOnlyPaintSurfaceIds = new Set<string>();
  const transformOnlyIds = normalizeSurfaceIdSet(transformOnlySourceIds);

  if (!changedElements) {
    return {
      dirtySurfaceInvalidations: [],
      dirtySurfaceIds: [],
      paintedSurfaceIds: [],
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
    paintedSurfaceIds.add(resolution.surfaceId);
    if (resolution.kind === "paint-only") {
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
    paintedSurfaceIds: [...paintedSurfaceIds],
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
  const nearestResolution = resolveNearestChangedSource({
    changedElement,
    sourceElementBySurfaceId,
    sourceIdAttribute,
    sourceSelector,
    transformOnlyIds,
  });
  if (nearestResolution !== undefined) {
    return nearestResolution;
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

function resolveNearestChangedSource({
  changedElement,
  sourceElementBySurfaceId,
  sourceIdAttribute,
  sourceSelector,
  transformOnlyIds,
}: {
  readonly changedElement: Element;
  readonly sourceElementBySurfaceId: ReadonlyMap<string, HTMLElement>;
  readonly sourceIdAttribute: string;
  readonly sourceSelector: string;
  readonly transformOnlyIds: ReadonlySet<string>;
}): ChangedSourceResolution | null | undefined {
  const nearestSourceElement =
    changedElement.closest<HTMLElement>(sourceSelector);
  if (!nearestSourceElement) {
    return undefined;
  }
  const nearestSourceId = nearestSourceElement.getAttribute(sourceIdAttribute);
  if (!nearestSourceId) {
    return undefined;
  }
  if (sourceElementBySurfaceId.get(nearestSourceId) !== nearestSourceElement) {
    return undefined;
  }
  if (changedElement === nearestSourceElement) {
    return resolveDirectSourcePaint({
      sourceElement: nearestSourceElement,
      sourceId: nearestSourceId,
      transformOnlyIds,
    });
  }
  return {
    kind: "content",
    sourceRect: resolveElementSourceRect({
      sourceElement: nearestSourceElement,
      target: changedElement,
    }),
    surfaceId: nearestSourceId,
  };
}

function resolveDirectSourcePaint({
  sourceElement,
  sourceId,
  transformOnlyIds,
}: {
  readonly sourceElement: HTMLElement;
  readonly sourceId: string;
  readonly transformOnlyIds: ReadonlySet<string>;
}): ChangedSourceResolution | null {
  if (transformOnlyIds.has(sourceId)) {
    return {
      kind: "transform-only",
      surfaceId: sourceId,
    };
  }
  const sourceRect = resolveHtmlSurfaceDirectPaintSourceRectHint(sourceElement);
  if (sourceRect) {
    return {
      kind: "content",
      sourceRect,
      surfaceId: sourceId,
    };
  }
  if (isExplicitDirtyHtmlSurfaceSource(sourceElement)) {
    return {
      kind: "paint-only",
      surfaceId: sourceId,
    };
  }
  return {
    kind: "content",
    surfaceId: sourceId,
  };
}

function isExplicitDirtyHtmlSurfaceSource(sourceElement: HTMLElement): boolean {
  return (
    sourceElement.getAttribute(HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE) ===
    "true"
  );
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
