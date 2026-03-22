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
  previewLocalityEligible?: boolean;
  zoom: number;
  projectedWidthPx: number | null;
  projectedHeightPx: number | null;
};

export type SectionBodyPreviewCandidateInputs = Omit<
  SectionBodyAutoModeInputs,
  "viewportInteractionActive" | "previewLocalityEligible"
>;

export const SECTION_BODY_AUTO_MODE_THRESHOLDS = {
  previewEligibleFamilies: ["tier1-dense-params"] as const,
  previewMaxZoom: 0.9,
  previewMaxProjectedWidthPx: 320,
  previewMaxProjectedHeightPx: 220,
  previewFallbackMaxZoomWithoutMeasuredSize: 0.55,
  previewWarmNeighborhoodMaxSections: 8,
  previewWarmNeighborhoodPaddingFraction: 0.35,
} as const;

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

export function isAutoSectionBodyPreviewCandidate({
  ownerKind,
  family,
  isActiveSection,
  zoom,
  projectedWidthPx,
  projectedHeightPx,
}: SectionBodyPreviewCandidateInputs): boolean {
  if (ownerKind !== "canvas") {
    return false;
  }
  if (isActiveSection) {
    return false;
  }
  if (!isPreviewEligibleFamily(family)) {
    return false;
  }

  if (projectedWidthPx === null || projectedHeightPx === null) {
    return (
      zoom <=
      SECTION_BODY_AUTO_MODE_THRESHOLDS.previewFallbackMaxZoomWithoutMeasuredSize
    );
  }

  const isSmallEnoughForPreview =
    projectedWidthPx <=
      SECTION_BODY_AUTO_MODE_THRESHOLDS.previewMaxProjectedWidthPx &&
    projectedHeightPx <=
      SECTION_BODY_AUTO_MODE_THRESHOLDS.previewMaxProjectedHeightPx;

  return (
    zoom <= SECTION_BODY_AUTO_MODE_THRESHOLDS.previewMaxZoom &&
    isSmallEnoughForPreview
  );
}

export function getAutoSectionBodyRequestedMode({
  viewportInteractionActive,
  previewLocalityEligible = true,
  ...previewCandidateInputs
}: SectionBodyAutoModeInputs): Exclude<SectionBodyRequestedMode, "auto"> {
  if (!viewportInteractionActive) {
    return "live";
  }

  if (!previewLocalityEligible) {
    return "live";
  }

  return isAutoSectionBodyPreviewCandidate(previewCandidateInputs)
    ? "preview"
    : "live";
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
