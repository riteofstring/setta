export type SectionBodyRequestedMode =
  | "auto"
  | "live"
  | "warm"
  | "preview"
  | "skip";

export type SectionBodyResolvedMode = "live" | "preview" | "skip";

export type SectionBodyFamily =
  | "tier1-dense-params"
  | "tier2-code"
  | "chat"
  | "sparse-local"
  | "generic";

export type SectionBodyAutoModeInputs = {
  ownerKind: "canvas" | "window";
  family: SectionBodyFamily;
  isActiveSection: boolean;
  viewportInteractionActive: boolean;
  zoom: number;
  projectedWidthPx: number | null;
  projectedHeightPx: number | null;
};

export const SECTION_BODY_AUTO_MODE_THRESHOLDS = {
  previewEligibleFamilies: ["tier1-dense-params"] as const,
  previewMaxZoom: 0.9,
  previewMaxProjectedWidthPx: 320,
  previewMaxProjectedHeightPx: 220,
  previewFallbackMaxZoomWithoutMeasuredSize: 0.55,
} as const;

type SectionSecondaryChromeTrimInputs = Pick<
  SectionBodyAutoModeInputs,
  "ownerKind" | "family" | "isActiveSection" | "viewportInteractionActive"
>;

function isPreviewEligibleFamily(family: SectionBodyFamily): boolean {
  return SECTION_BODY_AUTO_MODE_THRESHOLDS.previewEligibleFamilies.includes(
    family as (typeof SECTION_BODY_AUTO_MODE_THRESHOLDS.previewEligibleFamilies)[number],
  );
}

export function getProjectedNodeSizePx(
  width: number | null,
  height: number | null,
  zoom: number,
): { projectedWidthPx: number | null; projectedHeightPx: number | null } {
  return {
    projectedWidthPx: width === null ? null : width * zoom,
    projectedHeightPx: height === null ? null : height * zoom,
  };
}

export function getAutoSectionBodyRequestedMode({
  ownerKind,
  family,
  isActiveSection,
  viewportInteractionActive,
  zoom,
  projectedWidthPx,
  projectedHeightPx,
}: SectionBodyAutoModeInputs): Exclude<SectionBodyRequestedMode, "auto"> {
  if (ownerKind !== "canvas") {
    return "live";
  }
  if (isActiveSection) {
    return "live";
  }
  if (!viewportInteractionActive) {
    return "live";
  }
  if (!isPreviewEligibleFamily(family)) {
    return "live";
  }

  if (projectedWidthPx === null || projectedHeightPx === null) {
    return zoom <=
      SECTION_BODY_AUTO_MODE_THRESHOLDS.previewFallbackMaxZoomWithoutMeasuredSize
      ? "preview"
      : "live";
  }

  const isSmallEnoughForPreview =
    projectedWidthPx <= SECTION_BODY_AUTO_MODE_THRESHOLDS.previewMaxProjectedWidthPx &&
    projectedHeightPx <=
      SECTION_BODY_AUTO_MODE_THRESHOLDS.previewMaxProjectedHeightPx;

  return zoom <= SECTION_BODY_AUTO_MODE_THRESHOLDS.previewMaxZoom &&
    isSmallEnoughForPreview
    ? "preview"
    : "live";
}

export function shouldTrimSectionSecondaryChromeOnInteraction({
  ownerKind,
  family,
  isActiveSection,
  viewportInteractionActive,
}: SectionSecondaryChromeTrimInputs): boolean {
  if (ownerKind !== "canvas") {
    return false;
  }
  if (family !== "tier1-dense-params") {
    return false;
  }
  return viewportInteractionActive && !isActiveSection;
}

export function resolveRequestedMode(
  requestedMode: Exclude<SectionBodyRequestedMode, "auto">,
  isMinimized: boolean,
): SectionBodyResolvedMode {
  if (isMinimized || requestedMode === "skip") {
    return "skip";
  }
  if (requestedMode === "preview") {
    return "preview";
  }
  return "live";
}
