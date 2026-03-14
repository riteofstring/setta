import { adjustSizeToBeAtLeastMin } from "state/actions/sections/sectionSizes";
import { SectionSize } from "utils/generatedTypes";
import { SIZE_MODE } from "./utils";

export const AUTO_CLAMP_TOLERANCE = 2;

type SizeModeValue = (typeof SIZE_MODE)[keyof typeof SIZE_MODE];

type ResizeSizeMode = {
  width: SizeModeValue;
  height: SizeModeValue;
};

type ResizeEndDecisionInput = {
  resizeStarted: boolean;
  resizeAttempted: boolean;
  isZeroDelta: boolean;
  isDoubleClick: boolean;
};

export function shouldEmitResizeEndEvent({
  resizeStarted,
  resizeAttempted,
  isZeroDelta,
  isDoubleClick,
}: ResizeEndDecisionInput): boolean {
  if (!resizeStarted) {
    return false;
  }
  if (isZeroDelta && !isDoubleClick && !resizeAttempted) {
    return false;
  }
  return true;
}

export function clampChangedSize({
  changedSize,
  minHeight,
  minWidth,
  aspectRatio,
}: {
  changedSize: Partial<SectionSize>;
  minHeight: number;
  minWidth: number;
  aspectRatio: boolean;
}) {
  const clampedSize = { ...changedSize };
  const hasHeight = typeof changedSize.height === "number";
  const hasWidth = typeof changedSize.width === "number";

  if (hasHeight && hasWidth) {
    if (aspectRatio) {
      const adjusted = adjustSizeToBeAtLeastMin(
        changedSize.height,
        changedSize.width,
        minHeight,
        minWidth,
      );
      clampedSize.height = adjusted.height;
      clampedSize.width = adjusted.width;
      return clampedSize;
    }
    if (changedSize.height < minHeight) {
      clampedSize.height = minHeight;
    }
    if (changedSize.width < minWidth) {
      clampedSize.width = minWidth;
    }
    return clampedSize;
  }

  if (hasHeight && changedSize.height < minHeight) {
    clampedSize.height = minHeight;
  }
  if (hasWidth && changedSize.width < minWidth) {
    clampedSize.width = minWidth;
  }

  return clampedSize;
}

export function getAutoClampSize({
  size,
  minHeight,
  minWidth,
  aspectRatio,
  sizeMode,
}: {
  size: SectionSize;
  minHeight: number;
  minWidth: number;
  aspectRatio: boolean;
  sizeMode: ResizeSizeMode;
}): Partial<SectionSize> | null {
  const hasHeight = typeof size.height === "number";
  const hasWidth = typeof size.width === "number";
  const heightDelta = hasHeight ? minHeight - size.height : null;
  const widthDelta = hasWidth ? minWidth - size.width : null;
  const shouldClampHeight =
    sizeMode.height !== SIZE_MODE.auto_only &&
    heightDelta !== null &&
    heightDelta > AUTO_CLAMP_TOLERANCE;
  const shouldClampWidth =
    sizeMode.width !== SIZE_MODE.auto_only &&
    widthDelta !== null &&
    widthDelta > AUTO_CLAMP_TOLERANCE;

  if (!shouldClampHeight && !shouldClampWidth) {
    return null;
  }

  const nextSize: Partial<SectionSize> = {};
  if (
    aspectRatio &&
    hasHeight &&
    hasWidth &&
    sizeMode.height !== SIZE_MODE.auto_only &&
    sizeMode.width !== SIZE_MODE.auto_only
  ) {
    const adjusted = adjustSizeToBeAtLeastMin(
      size.height,
      size.width,
      minHeight,
      minWidth,
    );
    if (adjusted.height !== size.height) {
      nextSize.height = adjusted.height;
    }
    if (adjusted.width !== size.width) {
      nextSize.width = adjusted.width;
    }
  } else {
    if (shouldClampHeight) {
      nextSize.height = minHeight;
    }
    if (shouldClampWidth) {
      nextSize.width = minWidth;
    }
  }

  return Object.keys(nextSize).length > 0 ? nextSize : null;
}
