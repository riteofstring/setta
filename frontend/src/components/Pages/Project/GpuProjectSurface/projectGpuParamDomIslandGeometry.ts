import type { GpuRect } from "gpuFlow/viewportMath";

const PROJECT_GPU_ACTIVE_PARAM_DROPZONE_ISLAND_HEIGHT_PX = 132;
const PROJECT_GPU_ACTIVE_PARAM_DROPZONE_ISLAND_WIDTH_PX = 240;

type ProjectGpuParamActiveControlGeometry =
  | {
      readonly kind: "default";
    }
  | {
      readonly kind: "dropzone";
    };

export function getProjectGpuParamDomIslandGeometry({
  clipRect,
  controlKind,
  controlRect,
}: {
  readonly clipRect: GpuRect;
  readonly controlKind: string | null;
  readonly controlRect: GpuRect;
}): { readonly contentRect: GpuRect; readonly rect: GpuRect } | null {
  const activeControlGeometry = getProjectGpuParamActiveControlGeometry({
    controlKind,
  });
  const islandRect = intersectProjectGpuParamRects(
    getProjectGpuParamDomIslandOuterRect({
      activeControlGeometry,
      controlRect,
    }),
    clipRect,
  );
  if (islandRect.width <= 0 || islandRect.height <= 0) {
    return null;
  }
  const contentRect = getProjectGpuParamDomIslandContentRect({
    activeControlGeometry,
    controlRect,
    islandRect,
  });
  if (contentRect.width <= 0 || contentRect.height <= 0) {
    return null;
  }
  return { contentRect, rect: islandRect };
}

function getProjectGpuParamActiveControlGeometry({
  controlKind,
}: {
  readonly controlKind: string | null;
}): ProjectGpuParamActiveControlGeometry {
  if (controlKind === "dropzone") {
    return { kind: "dropzone" };
  }
  return { kind: "default" };
}

function getProjectGpuParamDomIslandOuterRect({
  activeControlGeometry,
  controlRect,
}: {
  readonly activeControlGeometry: ProjectGpuParamActiveControlGeometry;
  readonly controlRect: GpuRect;
}): GpuRect {
  if (activeControlGeometry.kind === "dropzone") {
    return {
      height: Math.max(
        controlRect.height,
        PROJECT_GPU_ACTIVE_PARAM_DROPZONE_ISLAND_HEIGHT_PX,
      ),
      width: Math.max(
        controlRect.width,
        PROJECT_GPU_ACTIVE_PARAM_DROPZONE_ISLAND_WIDTH_PX,
      ),
      x:
        controlRect.x -
        Math.max(
          0,
          PROJECT_GPU_ACTIVE_PARAM_DROPZONE_ISLAND_WIDTH_PX - controlRect.width,
        ),
      y: controlRect.y,
    };
  }
  return controlRect;
}

function getProjectGpuParamDomIslandContentRect({
  activeControlGeometry,
  controlRect,
  islandRect,
}: {
  readonly activeControlGeometry: ProjectGpuParamActiveControlGeometry;
  readonly controlRect: GpuRect;
  readonly islandRect: GpuRect;
}): GpuRect {
  if (activeControlGeometry.kind === "dropzone") {
    return {
      height: islandRect.height,
      width: islandRect.width,
      x: 0,
      y: 0,
    };
  }
  return {
    height: controlRect.height,
    width: controlRect.width,
    x: controlRect.x - islandRect.x,
    y: controlRect.y - islandRect.y,
  };
}

export function translateProjectGpuParamLocalRect(
  localRect: GpuRect,
  sectionRect: GpuRect,
): GpuRect {
  return {
    height: Math.min(localRect.height, sectionRect.height),
    width: Math.min(localRect.width, sectionRect.width),
    x: sectionRect.x + localRect.x,
    y: sectionRect.y + localRect.y,
  };
}

export function intersectProjectGpuParamRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, maxY - y),
    width: Math.max(0, maxX - x),
    x,
    y,
  };
}
