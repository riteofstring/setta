import _ from "lodash";
import { getSectionOrThrow } from "../../document/documentSelectors";
import { useWorkspaceDocument } from "../../document/stores";
import { useResizeEvent } from "./resizeEvents";

// The reference's section sizing policy (`useSettings.sectionSizingPolicy`), trimmed to the
// slice-reachable branches of `useSectionMinMaxDims`. The values are the shipped defaults from
// `internal/settingsstate/defaults.json` at 043d3b2e9 for the generic section shape; the
// params/search measured-height minimums, per-application-type overrides, and meta-control
// sizing modes left with their features. Per-kind sizing registration is a Phase 2
// registry decision.
export const SECTION_SIZING_POLICY = {
  minHeight: 0,
  maxHeight: 100_000,
  minWidth: 200,
  maxWidth: 100_000,
  minimizedHeight: 32,
  autoMaxHeight: 350,
} as const;

export type SectionMinMaxDims = {
  minHeight: number;
  maxHeight: number;
  minWidth: number;
  maxWidth: number;
};

export function getSectionMinMaxDims({
  isMinimized,
  isAutoHeight,
  isResizing,
}: {
  isMinimized: boolean;
  isAutoHeight: boolean;
  isResizing: boolean;
}): SectionMinMaxDims {
  if (isMinimized) {
    return {
      minHeight: SECTION_SIZING_POLICY.minimizedHeight,
      maxHeight: SECTION_SIZING_POLICY.minimizedHeight,
      minWidth: SECTION_SIZING_POLICY.minWidth,
      maxWidth: SECTION_SIZING_POLICY.maxWidth,
    };
  }
  const { minHeight, maxHeight: policyMaxHeight, autoMaxHeight } = SECTION_SIZING_POLICY;
  const cappedAutoMaxHeight = Math.min(policyMaxHeight, autoMaxHeight);
  const maxHeight =
    isAutoHeight && !isResizing
      ? Math.max(minHeight, cappedAutoMaxHeight)
      : Math.max(minHeight, policyMaxHeight);
  return {
    minHeight,
    maxHeight,
    minWidth: SECTION_SIZING_POLICY.minWidth,
    maxWidth: SECTION_SIZING_POLICY.maxWidth,
  };
}

export function useSectionMinMaxDims(sectionId: string): SectionMinMaxDims {
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);
  return useWorkspaceDocument((x) => {
    const section = getSectionOrThrow(x, sectionId);
    return getSectionMinMaxDims({
      isMinimized: section.isMinimized,
      isAutoHeight: section.size.height === "auto",
      isResizing: resizeEvent === "start",
    });
  }, _.isEqual);
}
