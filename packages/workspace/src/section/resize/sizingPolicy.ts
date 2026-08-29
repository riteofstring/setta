import _ from "lodash";
import {
  getMetaControlHeightSizeMode,
  getMetaControlMinimumSize,
  type MetaControlHeightSizeMode,
} from "../../controls/meta/metaControlTypes";
import { getSectionOrThrow } from "../../document/documentSelectors";
import {
  getMetaControlPresentation,
  getSectionKindSizeConstraints,
} from "../../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../../document/stores";
import { useResizeEvent } from "./resizeEvents";
import { useWorkspaceHost } from "../../workspaceHostContext";
import {
  getWorkspaceSectionSizeBounds,
  SECTION_SIZING_POLICY,
  type WorkspaceSectionSizeConstraints,
} from "./sectionSizingBounds";

export { SECTION_SIZING_POLICY } from "./sectionSizingBounds";

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
  sizeConstraints,
  heightSizeMode = "any",
}: {
  isMinimized: boolean;
  isAutoHeight: boolean;
  isResizing: boolean;
  minimumSize?: { width: number; height: number };
  sizeConstraints?: WorkspaceSectionSizeConstraints;
  heightSizeMode?: MetaControlHeightSizeMode;
}): SectionMinMaxDims {
  const bounds = getWorkspaceSectionSizeBounds(sizeConstraints, minimumSize);
  if (isMinimized) {
    return {
      minHeight: SECTION_SIZING_POLICY.minimizedHeight,
      maxHeight: SECTION_SIZING_POLICY.minimizedHeight,
      minWidth: bounds.minWidth,
      maxWidth: bounds.maxWidth,
      heightSizeMode,
    };
  }
  const { maxHeight: policyMaxHeight, autoMaxHeight } = SECTION_SIZING_POLICY;
  const cappedAutoMaxHeight = Math.min(
    bounds.maxHeight,
    policyMaxHeight,
    autoMaxHeight,
  );
  const maxHeight =
    isAutoHeight && !isResizing
      ? Math.max(bounds.minHeight, cappedAutoMaxHeight)
      : bounds.maxHeight;
  return {
    minHeight: bounds.minHeight,
    maxHeight,
    minWidth: bounds.minWidth,
    maxWidth: bounds.maxWidth,
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
    const sizeConstraints = getSectionKindSizeConstraints(host, section);
    const heightSizeMode = controlKind
      ? getMetaControlHeightSizeMode(controlKind)
      : "any";
    return getSectionMinMaxDims({
      isMinimized: section.isMinimized,
      isAutoHeight: section.size.height === "auto",
      isResizing: resizeEvent === "start",
      minimumSize,
      sizeConstraints: sizeConstraints ?? undefined,
      heightSizeMode,
    });
  }, _.isEqual);
}
