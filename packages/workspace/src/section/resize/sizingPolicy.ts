import _ from "lodash";
import {
  getMetaControlHeightSizeMode,
  getMetaControlMinimumSize,
  type MetaControlHeightSizeMode,
} from "../../controls/meta/metaControlTypes";
import { getSectionOrThrow } from "../../document/documentSelectors";
import { getMetaControlPresentation } from "../../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../../document/stores";
import { useResizeEvent } from "./resizeEvents";
import { useWorkspaceHost } from "../../workspaceHostContext";

// The reference's section sizing policy (`useSettings.sectionSizingPolicy`), trimmed to the
// slice-reachable branches of `useSectionMinMaxDims`. The values are the shipped defaults from
// `internal/settingsstate/defaults.json` at 043d3b2e9 for the generic section shape; the
// params/search measured-height minimums and per-application-type overrides left with their
// features. The meta-control milestone restores frozen main's per-control minimum dimensions and
// auto-only height modes through the registered presentation projection.
export const SECTION_SIZING_POLICY = {
  minHeight: 0,
  maxHeight: 100_000,
  minWidth: 200,
  maxWidth: 100_000,
  minimizedHeight: 32,
  autoMaxHeight: 350,
} as const;

type SectionMinMaxDims = {
  minHeight: number;
  maxHeight: number;
  minWidth: number;
  maxWidth: number;
  heightSizeMode: MetaControlHeightSizeMode;
};

export function getSectionMinMaxDims({
  isMinimized,
  isAutoHeight,
  isResizing,
  minimumSize,
  heightSizeMode = "any",
}: {
  isMinimized: boolean;
  isAutoHeight: boolean;
  isResizing: boolean;
  minimumSize?: { width: number; height: number };
  heightSizeMode?: MetaControlHeightSizeMode;
}): SectionMinMaxDims {
  const minWidth = Math.max(
    SECTION_SIZING_POLICY.minWidth,
    minimumSize?.width ?? 0,
  );
  const minimumContentHeight = Math.max(
    SECTION_SIZING_POLICY.minHeight,
    minimumSize?.height ?? 0,
  );
  if (isMinimized) {
    const minimizedHeight = Math.max(
      SECTION_SIZING_POLICY.minimizedHeight,
      minimumContentHeight,
    );
    return {
      minHeight: minimizedHeight,
      maxHeight: minimizedHeight,
      minWidth,
      maxWidth: SECTION_SIZING_POLICY.maxWidth,
      heightSizeMode,
    };
  }
  const { maxHeight: policyMaxHeight, autoMaxHeight } = SECTION_SIZING_POLICY;
  const cappedAutoMaxHeight = Math.min(policyMaxHeight, autoMaxHeight);
  const maxHeight =
    isAutoHeight && !isResizing
      ? Math.max(minimumContentHeight, cappedAutoMaxHeight)
      : Math.max(minimumContentHeight, policyMaxHeight);
  return {
    minHeight: minimumContentHeight,
    maxHeight,
    minWidth,
    maxWidth: SECTION_SIZING_POLICY.maxWidth,
    heightSizeMode,
  };
}

export function useSectionMinMaxDims(sectionId: string): SectionMinMaxDims {
  const host = useWorkspaceHost();
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);
  return useWorkspaceDocument((x) => {
    const section = getSectionOrThrow(x, sectionId);
    const metaControlPresentation = getMetaControlPresentation(host, section);
    const controlKind = metaControlPresentation?.resolveControlKind(section);
    const minimumSize = controlKind
      ? getMetaControlMinimumSize(controlKind)
      : undefined;
    const heightSizeMode = controlKind
      ? getMetaControlHeightSizeMode(controlKind)
      : "any";
    return getSectionMinMaxDims({
      isMinimized: section.isMinimized,
      isAutoHeight: section.size.height === "auto",
      isResizing: resizeEvent === "start",
      minimumSize,
      heightSizeMode,
    });
  }, _.isEqual);
}
