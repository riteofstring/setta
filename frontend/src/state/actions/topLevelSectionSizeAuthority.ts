import type {
  SectionSize,
  SectionSizingPolicy,
  SectionType,
} from "utils/generatedTypes";

export type TopLevelSectionNodeSizeAuthority =
  | "layout"
  | "sharedNode"
  | "sectionModel"
  | "none";

type TopLevelSectionNodeLayoutSize = {
  h: number | null;
  w: number | null;
};

type TopLevelSectionNodeCurrentSize = {
  height: number | null;
  sizeAuthority?: TopLevelSectionNodeSizeAuthority;
  width: number | null;
};

type ResolveTopLevelSectionNodeSizeArgs = {
  configuredSize: Pick<SectionSize, "height" | "width"> | null | undefined;
  currentNode: TopLevelSectionNodeCurrentSize | undefined;
  layout: TopLevelSectionNodeLayoutSize;
  sectionSizingPolicy: SectionSizingPolicy;
  sectionTypeName: SectionType | undefined;
};

export function resolveTopLevelSectionNodeSize({
  configuredSize,
  currentNode,
  layout,
  sectionSizingPolicy,
  sectionTypeName,
}: ResolveTopLevelSectionNodeSizeArgs): {
  height: number | null;
  sizeAuthority: TopLevelSectionNodeSizeAuthority;
  width: number | null;
} {
  if (hasPositiveTopLevelSectionNodeSize(layout.w, layout.h)) {
    return {
      height: layout.h,
      sizeAuthority: "layout",
      width: layout.w,
    };
  }

  const sectionModelWidth = resolveTopLevelSectionDimensionWithFallback({
    axis: "width",
    configuredValue: configuredSize?.width,
    layoutValue: layout.w,
    sectionSizingPolicy,
    sectionTypeName,
  });
  const sectionModelHeight = resolveTopLevelSectionDimensionWithFallback({
    axis: "height",
    configuredValue: configuredSize?.height,
    layoutValue: layout.h,
    sectionSizingPolicy,
    sectionTypeName,
  });
  const hasSectionModelSize = hasPositiveTopLevelSectionNodeSize(
    sectionModelWidth,
    sectionModelHeight,
  );

  const currentNodeWidth = currentNode?.width ?? null;
  const currentNodeHeight = currentNode?.height ?? null;
  if (currentNode?.sizeAuthority === "sectionModel" && hasSectionModelSize) {
    return {
      height: sectionModelHeight,
      sizeAuthority: "sectionModel",
      width: sectionModelWidth,
    };
  }

  if (
    currentNode?.sizeAuthority === "sharedNode" &&
    hasPositiveTopLevelSectionNodeSize(currentNodeWidth, currentNodeHeight)
  ) {
    return {
      height: currentNodeHeight,
      sizeAuthority: "sharedNode",
      width: currentNodeWidth,
    };
  }

  if (hasSectionModelSize) {
    return {
      height: sectionModelHeight,
      sizeAuthority: "sectionModel",
      width: sectionModelWidth,
    };
  }

  return {
    height: null,
    sizeAuthority: "none",
    width: null,
  };
}

export function hasPositiveTopLevelSectionNodeSize(
  width: number | null | undefined,
  height: number | null | undefined,
) {
  return (
    typeof width === "number" &&
    width > 0 &&
    typeof height === "number" &&
    height > 0
  );
}

function resolveTopLevelSectionDimensionWithFallback({
  axis,
  configuredValue,
  layoutValue,
  sectionSizingPolicy,
  sectionTypeName,
}: {
  axis: "height" | "width";
  configuredValue: SectionSize["height"] | SectionSize["width"] | undefined;
  layoutValue: number | null;
  sectionSizingPolicy: SectionSizingPolicy;
  sectionTypeName: SectionType | undefined;
}) {
  const positiveLayoutValue =
    coercePositiveTopLevelSectionDimension(layoutValue);
  if (positiveLayoutValue !== null) {
    return positiveLayoutValue;
  }

  const positiveConfiguredValue = coercePositiveTopLevelSectionDimension(
    typeof configuredValue === "number" ? configuredValue : null,
  );
  if (positiveConfiguredValue !== null) {
    return positiveConfiguredValue;
  }

  if (!sectionTypeName) {
    return null;
  }

  const sizingPolicyEntry = sectionSizingPolicy.byType[sectionTypeName];
  if (axis === "width") {
    return sizingPolicyEntry.minWidth;
  }

  return sizingPolicyEntry.minHeight;
}

function coercePositiveTopLevelSectionDimension(
  value: number | null | undefined,
): number | null {
  if (typeof value === "number" && value > 0) {
    return value;
  }

  return null;
}
