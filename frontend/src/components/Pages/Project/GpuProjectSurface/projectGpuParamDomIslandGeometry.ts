import type { GpuRect } from "gpuFlow/viewportMath";
import { getCurrEffectiveCodeObjImplWithTypeGuardIfPresent } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  DateControlModeEnum,
  isBaseParamCodeObjImpl,
  type DateParamCodeObjImpl,
} from "utils/generatedTypes";

const PROJECT_GPU_ACTIVE_PARAM_POPOVER_ISLAND_HEIGHT_PX = 260;
const PROJECT_GPU_ACTIVE_PARAM_POPOVER_ISLAND_WIDTH_PX = 224;
const PROJECT_GPU_ACTIVE_PARAM_DROPZONE_ISLAND_HEIGHT_PX = 132;
const PROJECT_GPU_ACTIVE_PARAM_DROPZONE_ISLAND_WIDTH_PX = 240;
const PROJECT_GPU_ACTIVE_PARAM_DATE_CALENDAR_ISLAND_HEIGHT_PX = 260;
const PROJECT_GPU_ACTIVE_PARAM_DATE_CALENDAR_WITH_TIME_ISLAND_HEIGHT_PX = 292;
const PROJECT_GPU_ACTIVE_PARAM_DATE_CALENDAR_ISLAND_WIDTH_PX = 252;

type ProjectGpuParamActiveControlGeometry =
  | {
      readonly kind: "default";
    }
  | {
      readonly kind: "date-calendar";
      readonly includesTime: boolean;
    }
  | {
      readonly kind: "dropzone";
    }
  | {
      readonly kind: "popover";
    };

export function getProjectGpuParamDomIslandGeometry({
  clipRect,
  controlKind,
  controlRect,
  paramInfoId,
  projectState,
  sectionId,
}: {
  readonly clipRect: GpuRect;
  readonly controlKind: string | null;
  readonly controlRect: GpuRect;
  readonly paramInfoId: string;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
}): { readonly contentRect: GpuRect; readonly rect: GpuRect } | null {
  const activeControlGeometry = getProjectGpuParamActiveControlGeometry({
    controlKind,
    paramInfoId,
    projectState,
    sectionId,
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
  paramInfoId,
  projectState,
  sectionId,
}: {
  readonly controlKind: string | null;
  readonly paramInfoId: string;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
}): ProjectGpuParamActiveControlGeometry {
  if (controlKind === "dropzone") {
    return { kind: "dropzone" };
  }
  if (controlKind === "color-picker" || controlKind === "dropdown") {
    return { kind: "popover" };
  }
  if (controlKind !== "date-time") {
    return { kind: "default" };
  }
  const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    projectState,
    sectionId,
    paramInfoId,
    isBaseParamCodeObjImpl,
  );
  if (!codeObjImpl) {
    throw new Error(
      `Missing GPU retained date-time param ${paramInfoId} in section ${sectionId}.`,
    );
  }
  if (
    isProjectGpuDateParamCodeObjImpl(codeObjImpl) &&
    codeObjImpl.dateControlMode === DateControlModeEnum.calendar
  ) {
    return {
      includesTime: codeObjImpl.dateIncludesTime,
      kind: "date-calendar",
    };
  }
  return { kind: "default" };
}

function isProjectGpuDateParamCodeObjImpl(
  codeObjImpl: unknown,
): codeObjImpl is DateParamCodeObjImpl {
  return (
    typeof codeObjImpl === "object" &&
    codeObjImpl !== null &&
    "type" in codeObjImpl &&
    codeObjImpl.type === CodeObjTypeEnum.DateParam
  );
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
  if (activeControlGeometry.kind === "date-calendar") {
    const calendarHeight = activeControlGeometry.includesTime
      ? PROJECT_GPU_ACTIVE_PARAM_DATE_CALENDAR_WITH_TIME_ISLAND_HEIGHT_PX
      : PROJECT_GPU_ACTIVE_PARAM_DATE_CALENDAR_ISLAND_HEIGHT_PX;
    return {
      height: Math.max(controlRect.height, calendarHeight),
      width: Math.max(
        controlRect.width,
        PROJECT_GPU_ACTIVE_PARAM_DATE_CALENDAR_ISLAND_WIDTH_PX,
      ),
      x:
        controlRect.x -
        Math.max(
          0,
          PROJECT_GPU_ACTIVE_PARAM_DATE_CALENDAR_ISLAND_WIDTH_PX -
            controlRect.width,
        ),
      y: controlRect.y,
    };
  }
  if (activeControlGeometry.kind === "popover") {
    return {
      height: Math.max(
        controlRect.height,
        PROJECT_GPU_ACTIVE_PARAM_POPOVER_ISLAND_HEIGHT_PX,
      ),
      width: Math.max(
        controlRect.width,
        PROJECT_GPU_ACTIVE_PARAM_POPOVER_ISLAND_WIDTH_PX,
      ),
      x:
        controlRect.x -
        Math.max(
          0,
          PROJECT_GPU_ACTIVE_PARAM_POPOVER_ISLAND_WIDTH_PX - controlRect.width,
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
  if (
    activeControlGeometry.kind === "dropzone" ||
    activeControlGeometry.kind === "date-calendar"
  ) {
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
