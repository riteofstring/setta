import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "../viewportMath";
import type {
  FlowRect,
  HtmlSurfaceEffectVisual,
  HtmlSurfaceFlatVisual,
  HtmlSurfaceMeshVisual,
  HtmlSurfaceTiledFlatVisual,
  HtmlSurfaceVisualScene,
  SurfaceVertex,
} from "./visualScene";

type HtmlSurfaceHitSurfaceBase = {
  readonly stackOrder?: number | undefined;
  readonly surfaceId: string;
  readonly zIndex: number;
};

export type HtmlSurfaceFlatHitSurface = FlowRect &
  HtmlSurfaceHitSurfaceBase & {
    readonly kind: "flat";
  };

export type HtmlSurfaceTiledFlatHitSurface = HtmlSurfaceHitSurfaceBase & {
  readonly kind: "tiled-flat";
  readonly rect: FlowRect;
  readonly sourceHeight: number;
  readonly sourceWidth: number;
};

export type HtmlSurfaceMeshHitSurface = HtmlSurfaceHitSurfaceBase & {
  readonly bounds: FlowRect;
  readonly indices: Uint32Array;
  readonly kind: "mesh";
  readonly sourceHeight: number;
  readonly sourceWidth: number;
  readonly vertices: readonly SurfaceVertex[];
};

export type HtmlSurfaceEffectHitSurface = HtmlSurfaceHitSurfaceBase & {
  readonly bounds: FlowRect;
  readonly effectId: string;
  readonly kind: "effect";
  readonly projectorId: string;
  readonly sourceHeight: number;
  readonly sourceWidth: number;
};

export type HtmlSurfaceHitSurface =
  | HtmlSurfaceFlatHitSurface
  | HtmlSurfaceTiledFlatHitSurface
  | HtmlSurfaceMeshHitSurface
  | HtmlSurfaceEffectHitSurface;

export type HtmlSurfaceHitScene = {
  readonly effectSurfaces: readonly HtmlSurfaceEffectHitSurface[];
  readonly flatSurfaces: readonly HtmlSurfaceFlatHitSurface[];
  readonly meshSurfaces: readonly HtmlSurfaceMeshHitSurface[];
  readonly tiledFlatSurfaces: readonly HtmlSurfaceTiledFlatHitSurface[];
};

export type HtmlSurfaceHitProjection = {
  readonly kind: HtmlSurfaceHitSurface["kind"];
  readonly localX: number;
  readonly localY: number;
  readonly surfaceId: string;
  readonly surfaceX: number;
  readonly surfaceY: number;
  readonly u: number;
  readonly v: number;
  readonly zIndex: number;
};

export type HtmlSurfaceEffectHitProjectorInput = {
  readonly surface: HtmlSurfaceEffectHitSurface;
  readonly surfaceX: number;
  readonly surfaceY: number;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
};

export type HtmlSurfaceEffectHitProjector = (
  input: HtmlSurfaceEffectHitProjectorInput,
) => Pick<HtmlSurfaceHitProjection, "localX" | "localY" | "u" | "v"> | null;

type ResolveHtmlSurfaceHitInput = {
  readonly effectProjectors?:
    | ReadonlyMap<string, HtmlSurfaceEffectHitProjector>
    | undefined;
  readonly scene: HtmlSurfaceHitScene;
  readonly surfaceX: number;
  readonly surfaceY: number;
  readonly viewport: GpuViewportInput;
};

type HtmlSurfaceHitSurfaceEntry = {
  readonly stackOrder: number;
  readonly surface: HtmlSurfaceHitSurface;
};

type SurfacePoint = {
  readonly x: number;
  readonly y: number;
};

export function createHtmlSurfaceHitScene({
  effectSurfaces = [],
  flatSurfaces = [],
  meshSurfaces = [],
  tiledFlatSurfaces = [],
}: Partial<HtmlSurfaceHitScene> = {}): HtmlSurfaceHitScene {
  return {
    effectSurfaces,
    flatSurfaces,
    meshSurfaces,
    tiledFlatSurfaces,
  };
}

export function createHtmlSurfaceHitSceneFromVisualScene(
  scene: HtmlSurfaceVisualScene,
): HtmlSurfaceHitScene {
  let stackOrder = 0;
  return createHtmlSurfaceHitScene({
    flatSurfaces: scene.flatSurfaces.map((surface) =>
      toFlatHitSurface(surface, stackOrder++),
    ),
    tiledFlatSurfaces: scene.tiledFlatSurfaces.map((surface) =>
      toTiledFlatHitSurface(surface, stackOrder++),
    ),
    meshSurfaces: scene.meshSurfaces.map((surface) =>
      toMeshHitSurface(surface, stackOrder++),
    ),
    effectSurfaces: scene.effectSurfaces.map((surface) =>
      toEffectHitSurface(surface, stackOrder++),
    ),
  });
}

export function resolveHtmlSurfaceHitAtClientPoint({
  clientX,
  clientY,
  effectProjectors,
  scene,
  surfaceElement,
  viewport,
}: {
  readonly clientX: number;
  readonly clientY: number;
  readonly effectProjectors?:
    | ReadonlyMap<string, HtmlSurfaceEffectHitProjector>
    | undefined;
  readonly scene: HtmlSurfaceHitScene;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
}): HtmlSurfaceHitProjection | null {
  const surfaceRect = surfaceElement.getBoundingClientRect();
  return resolveHtmlSurfaceHitAtSurfacePoint({
    ...(effectProjectors ? { effectProjectors } : {}),
    scene,
    surfaceX: clientX - surfaceRect.left,
    surfaceY: clientY - surfaceRect.top,
    viewport,
  });
}

export function resolveHtmlSurfaceHitAtSurfacePoint({
  effectProjectors,
  scene,
  surfaceX,
  surfaceY,
  viewport,
}: ResolveHtmlSurfaceHitInput): HtmlSurfaceHitProjection | null {
  const normalizedViewport = normalizeGpuViewport(viewport);
  for (const entry of createSortedHitSurfaceEntries(scene)) {
    const hit = resolveHitSurfaceEntry({
      effectProjectors,
      entry,
      surfaceX,
      surfaceY,
      viewport: normalizedViewport,
    });
    if (hit) {
      return hit;
    }
  }
  return null;
}

function resolveFlatSurfaceHit(
  surface: HtmlSurfaceFlatHitSurface,
  surfaceX: number,
  surfaceY: number,
  viewport: ReturnType<typeof normalizeGpuViewport>,
): HtmlSurfaceHitProjection | null {
  if (surface.width <= 0 || surface.height <= 0) {
    return null;
  }
  const screenPosition = flowToScreenPosition(
    { x: surface.x, y: surface.y },
    viewport,
  );
  const screenWidth = surface.width * viewport.zoom;
  const screenHeight = surface.height * viewport.zoom;
  if (
    surfaceX < screenPosition.x ||
    surfaceX >= screenPosition.x + screenWidth ||
    surfaceY < screenPosition.y ||
    surfaceY >= screenPosition.y + screenHeight
  ) {
    return null;
  }
  const localX = (surfaceX - screenPosition.x) / viewport.zoom;
  const localY = (surfaceY - screenPosition.y) / viewport.zoom;
  return {
    kind: "flat",
    localX,
    localY,
    surfaceId: surface.surfaceId,
    surfaceX,
    surfaceY,
    u: localX / surface.width,
    v: localY / surface.height,
    zIndex: surface.zIndex,
  };
}

function resolveTiledFlatSurfaceHit(
  surface: HtmlSurfaceTiledFlatHitSurface,
  surfaceX: number,
  surfaceY: number,
  viewport: ReturnType<typeof normalizeGpuViewport>,
): HtmlSurfaceHitProjection | null {
  const flatHit = resolveFlatSurfaceHit(
    {
      ...surface.rect,
      kind: "flat",
      stackOrder: surface.stackOrder,
      surfaceId: surface.surfaceId,
      zIndex: surface.zIndex,
    },
    surfaceX,
    surfaceY,
    viewport,
  );
  if (!flatHit || surface.sourceWidth <= 0 || surface.sourceHeight <= 0) {
    return null;
  }
  return {
    ...flatHit,
    kind: "tiled-flat",
    u: flatHit.localX / surface.sourceWidth,
    v: flatHit.localY / surface.sourceHeight,
  };
}

function resolveMeshSurfaceHit(
  surface: HtmlSurfaceMeshHitSurface,
  surfaceX: number,
  surfaceY: number,
  viewport: ReturnType<typeof normalizeGpuViewport>,
): HtmlSurfaceHitProjection | null {
  if (!isMeshSurfaceHittable(surface, surfaceX, surfaceY, viewport)) {
    return null;
  }

  for (
    let indexOffset = 0;
    indexOffset + 2 < surface.indices.length;
    indexOffset += 3
  ) {
    const hit = resolveMeshTriangleHit(
      surface,
      indexOffset,
      { x: surfaceX, y: surfaceY },
      viewport,
    );
    if (hit) {
      return hit;
    }
  }

  return null;
}

function resolveEffectSurfaceHit({
  effectProjectors,
  surface,
  surfaceX,
  surfaceY,
  viewport,
}: {
  readonly effectProjectors:
    | ReadonlyMap<string, HtmlSurfaceEffectHitProjector>
    | undefined;
  readonly surface: HtmlSurfaceEffectHitSurface;
  readonly surfaceX: number;
  readonly surfaceY: number;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}): HtmlSurfaceHitProjection | null {
  if (
    !screenRectContainsFlowRectPoint(
      surface.bounds,
      surfaceX,
      surfaceY,
      viewport,
    )
  ) {
    return null;
  }
  const projector = effectProjectors?.get(surface.projectorId);
  if (!projector) {
    throw new Error(
      `HTML surface effect "${surface.effectId}" cannot be hit-tested without projector "${surface.projectorId}".`,
    );
  }
  const projection = projector({ surface, surfaceX, surfaceY, viewport });
  if (!projection) {
    return null;
  }
  return {
    kind: "effect",
    localX: projection.localX,
    localY: projection.localY,
    surfaceId: surface.surfaceId,
    surfaceX,
    surfaceY,
    u: projection.u,
    v: projection.v,
    zIndex: surface.zIndex,
  };
}

function isMeshSurfaceHittable(
  surface: HtmlSurfaceMeshHitSurface,
  surfaceX: number,
  surfaceY: number,
  viewport: ReturnType<typeof normalizeGpuViewport>,
): boolean {
  return (
    surface.sourceWidth > 0 &&
    surface.sourceHeight > 0 &&
    screenRectContainsFlowRectPoint(
      surface.bounds,
      surfaceX,
      surfaceY,
      viewport,
    )
  );
}

function resolveMeshTriangleHit(
  surface: HtmlSurfaceMeshHitSurface,
  indexOffset: number,
  point: SurfacePoint,
  viewport: ReturnType<typeof normalizeGpuViewport>,
): HtmlSurfaceHitProjection | null {
  const triangle = getSurfaceTriangle(surface, indexOffset);
  if (!triangle) {
    return null;
  }
  const barycentric = resolveTriangleBarycentricAtSurfacePoint({
    ...triangle,
    point,
    viewport,
  });
  if (!barycentric) {
    return null;
  }
  const u =
    triangle.first.u * barycentric.first +
    triangle.second.u * barycentric.second +
    triangle.third.u * barycentric.third;
  const v =
    triangle.first.v * barycentric.first +
    triangle.second.v * barycentric.second +
    triangle.third.v * barycentric.third;
  return {
    kind: "mesh",
    localX: u * surface.sourceWidth,
    localY: v * surface.sourceHeight,
    surfaceId: surface.surfaceId,
    surfaceX: point.x,
    surfaceY: point.y,
    u,
    v,
    zIndex: surface.zIndex,
  };
}

function getSurfaceTriangle(
  surface: HtmlSurfaceMeshHitSurface,
  indexOffset: number,
): {
  readonly first: SurfaceVertex;
  readonly second: SurfaceVertex;
  readonly third: SurfaceVertex;
} | null {
  const first = surface.vertices[surface.indices[indexOffset] ?? -1];
  const second = surface.vertices[surface.indices[indexOffset + 1] ?? -1];
  const third = surface.vertices[surface.indices[indexOffset + 2] ?? -1];
  return first && second && third ? { first, second, third } : null;
}

function resolveHitSurfaceEntry({
  effectProjectors,
  entry,
  surfaceX,
  surfaceY,
  viewport,
}: {
  readonly effectProjectors:
    | ReadonlyMap<string, HtmlSurfaceEffectHitProjector>
    | undefined;
  readonly entry: HtmlSurfaceHitSurfaceEntry;
  readonly surfaceX: number;
  readonly surfaceY: number;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}): HtmlSurfaceHitProjection | null {
  const { surface } = entry;
  switch (surface.kind) {
    case "flat":
      return resolveFlatSurfaceHit(surface, surfaceX, surfaceY, viewport);
    case "tiled-flat":
      return resolveTiledFlatSurfaceHit(surface, surfaceX, surfaceY, viewport);
    case "mesh":
      return resolveMeshSurfaceHit(surface, surfaceX, surfaceY, viewport);
    case "effect":
      return resolveEffectSurfaceHit({
        effectProjectors,
        surface,
        surfaceX,
        surfaceY,
        viewport,
      });
  }
  const exhaustive: never = surface;
  return exhaustive;
}

function createSortedHitSurfaceEntries(
  scene: HtmlSurfaceHitScene,
): readonly HtmlSurfaceHitSurfaceEntry[] {
  return [
    ...toHitSurfaceEntries(scene.flatSurfaces, 0),
    ...toHitSurfaceEntries(scene.tiledFlatSurfaces, scene.flatSurfaces.length),
    ...toHitSurfaceEntries(
      scene.meshSurfaces,
      scene.flatSurfaces.length + scene.tiledFlatSurfaces.length,
    ),
    ...toHitSurfaceEntries(
      scene.effectSurfaces,
      scene.flatSurfaces.length +
        scene.tiledFlatSurfaces.length +
        scene.meshSurfaces.length,
    ),
  ].sort(compareHitSurfaceEntries);
}

function toHitSurfaceEntries<TSurface extends HtmlSurfaceHitSurface>(
  surfaces: readonly TSurface[],
  fallbackStackOrderOffset: number,
): HtmlSurfaceHitSurfaceEntry[] {
  return surfaces.map((surface, index) => ({
    stackOrder: surface.stackOrder ?? fallbackStackOrderOffset + index,
    surface,
  }));
}

function compareHitSurfaceEntries(
  left: HtmlSurfaceHitSurfaceEntry,
  right: HtmlSurfaceHitSurfaceEntry,
): number {
  return (
    right.surface.zIndex - left.surface.zIndex ||
    right.stackOrder - left.stackOrder
  );
}

function screenRectContainsFlowRectPoint(
  rect: FlowRect,
  surfaceX: number,
  surfaceY: number,
  viewport: ReturnType<typeof normalizeGpuViewport>,
): boolean {
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  const screenPosition = flowToScreenPosition(
    { x: rect.x, y: rect.y },
    viewport,
  );
  return (
    surfaceX >= screenPosition.x &&
    surfaceX < screenPosition.x + rect.width * viewport.zoom &&
    surfaceY >= screenPosition.y &&
    surfaceY < screenPosition.y + rect.height * viewport.zoom
  );
}

function resolveTriangleBarycentricAtSurfacePoint({
  first,
  second,
  third,
  point,
  viewport,
}: {
  readonly first: SurfaceVertex;
  readonly second: SurfaceVertex;
  readonly third: SurfaceVertex;
  readonly point: SurfacePoint;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}): {
  readonly first: number;
  readonly second: number;
  readonly third: number;
} | null {
  const a = flowToScreenPosition({ x: first.x, y: first.y }, viewport);
  const b = flowToScreenPosition({ x: second.x, y: second.y }, viewport);
  const c = flowToScreenPosition({ x: third.x, y: third.y }, viewport);
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < Number.EPSILON) {
    return null;
  }
  const firstWeight =
    ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) /
    denominator;
  const secondWeight =
    ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) /
    denominator;
  const thirdWeight = 1 - firstWeight - secondWeight;
  const epsilon = 1e-6;
  if (
    firstWeight < -epsilon ||
    secondWeight < -epsilon ||
    thirdWeight < -epsilon
  ) {
    return null;
  }
  return {
    first: firstWeight,
    second: secondWeight,
    third: thirdWeight,
  };
}

function toFlatHitSurface(
  surface: HtmlSurfaceFlatVisual,
  stackOrder: number,
): HtmlSurfaceFlatHitSurface {
  return {
    height: surface.height,
    kind: "flat",
    stackOrder,
    surfaceId: surface.surfaceId,
    width: surface.width,
    x: surface.x,
    y: surface.y,
    zIndex: surface.zIndex,
  };
}

function toTiledFlatHitSurface(
  surface: HtmlSurfaceTiledFlatVisual,
  stackOrder: number,
): HtmlSurfaceTiledFlatHitSurface {
  return {
    kind: "tiled-flat",
    rect: surface.rect,
    sourceHeight: surface.texture.cssHeight,
    sourceWidth: surface.texture.cssWidth,
    stackOrder,
    surfaceId: surface.surfaceId,
    zIndex: surface.zIndex,
  };
}

function toMeshHitSurface(
  surface: HtmlSurfaceMeshVisual,
  stackOrder: number,
): HtmlSurfaceMeshHitSurface {
  return {
    bounds: surface.bounds,
    indices: surface.indices,
    kind: "mesh",
    sourceHeight: surface.texture.cssHeight,
    sourceWidth: surface.texture.cssWidth,
    stackOrder,
    surfaceId: surface.surfaceId,
    vertices: surface.vertices,
    zIndex: surface.zIndex,
  };
}

function toEffectHitSurface(
  surface: HtmlSurfaceEffectVisual,
  stackOrder: number,
): HtmlSurfaceEffectHitSurface {
  return {
    bounds: surface.bounds,
    effectId: surface.effectId,
    kind: "effect",
    projectorId: surface.projectorId,
    sourceHeight: surface.texture.cssHeight,
    sourceWidth: surface.texture.cssWidth,
    stackOrder,
    surfaceId: surface.surfaceId,
    zIndex: surface.zIndex,
  };
}
