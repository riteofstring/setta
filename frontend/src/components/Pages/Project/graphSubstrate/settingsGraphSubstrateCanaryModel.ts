import type { Node } from "forks/xyflow/core/types";
import {
  getActiveViewModeTopLevelSections,
  getCurrEffectiveSectionImpl,
  getSectionShouldRender,
  getSectionViewModeVisibility,
  getTopLevelSectionIdsForDisplay,
} from "state/actions/sectionInfos";
import {
  resolveTopLevelSectionNodeSize,
  type TopLevelSectionNodeSizeAuthority,
} from "state/actions/topLevelSectionSizeAuthority";
import type { ZustandProjectState } from "state/definitions";
import {
  createSettingsState,
  SectionTypeEnum,
  type Position,
  type SectionSize,
  type SectionSizingPolicy,
  type SectionType,
} from "utils/generatedTypes";

export type GraphSubstrateCanaryLayoutSection = {
  sectionId: string;
  position: Position;
  zIndex: number;
  tempZIndex: number;
  width: number | null;
  height: number | null;
  configuredWidth: SectionSize["width"];
  configuredHeight: SectionSize["height"];
  isActiveSection?: boolean;
  isInOtherProjectConfigs?: boolean;
  positionAndSizeLocked: boolean;
  sectionTypeName?: SectionType;
  styleColor?: string | null;
  textBlockMetaControlStyle?: boolean;
};

export type SettingsGraphSubstrateCanarySectionSizeAuthority =
  TopLevelSectionNodeSizeAuthority;

const DEFAULT_SECTION_SIZING_POLICY = createSettingsState().sectionSizingPolicy;

export function resolveActiveViewModeName(
  projectState: Pick<ZustandProjectState, "projectConfig">,
): string | null {
  const activeViewModeId = projectState.projectConfig.activeViewModeId;
  if (!activeViewModeId) {
    return null;
  }
  return projectState.projectConfig.viewModes[activeViewModeId]?.name ?? null;
}

export function shouldUseSettingsGraphSubstrateCanary(
  projectConfigName: string | null | undefined,
  activeViewModeName: string | null | undefined,
): boolean {
  return (
    projectConfigName === "settings" && activeViewModeName === "All Settings"
  );
}

export function selectSettingsGraphSubstrateCanaryLayoutSections(
  projectState: ZustandProjectState,
): Array<GraphSubstrateCanaryLayoutSection> {
  const activeViewModeName = resolveActiveViewModeName(projectState);
  if (
    !shouldUseSettingsGraphSubstrateCanary(
      projectState.projectConfig.name,
      activeViewModeName,
    )
  ) {
    return [];
  }

  const layouts = getActiveViewModeTopLevelSections(projectState);
  const candidates: Array<GraphSubstrateCanaryLayoutSection> = [];

  for (const sectionId of getTopLevelSectionIdsForDisplay(projectState)) {
    const layout = layouts[sectionId];
    if (!layout) {
      continue;
    }
    const { visibility, isEditingViewMode } = getSectionViewModeVisibility(
      sectionId,
      projectState,
    );
    if (!getSectionShouldRender(visibility, isEditingViewMode)) {
      continue;
    }
    const impl = getCurrEffectiveSectionImpl(projectState, sectionId);
    candidates.push({
      sectionId,
      position: { x: layout.x, y: layout.y },
      zIndex: layout.zIndex,
      tempZIndex: layout.zIndex,
      width: layout.w,
      height: layout.h,
      configuredWidth: impl.size.width,
      configuredHeight: impl.size.height,
      isActiveSection: projectState.projectConfig.activeIds.includes(sectionId),
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      sectionTypeName: impl.type,
      styleColor: impl.styleColor,
      textBlockMetaControlStyle:
        impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
    });
  }

  return candidates;
}

export type GraphSubstrateCanarySection = {
  sectionId: string;
  position: Position;
  zIndex: number;
  tempZIndex: number;
  width: number | null;
  height: number | null;
  isActiveSection?: boolean;
  isInOtherProjectConfigs?: boolean;
  positionAndSizeLocked: boolean;
  sectionTypeName?: SectionType;
  styleColor?: string | null;
  textBlockMetaControlStyle?: boolean;
  sizeAuthority?: SettingsGraphSubstrateCanarySectionSizeAuthority;
};

export function selectSettingsGraphSubstrateCanarySections(
  projectState: ZustandProjectState,
  sectionSizingPolicy: SectionSizingPolicy = DEFAULT_SECTION_SIZING_POLICY,
): Array<GraphSubstrateCanarySection> {
  return resolveSettingsGraphSubstrateCanarySections(
    selectSettingsGraphSubstrateCanaryLayoutSections(projectState),
    new Map(),
    sectionSizingPolicy,
  );
}

export function resolveSettingsGraphSubstrateCanarySections(
  layoutSections: Array<GraphSubstrateCanaryLayoutSection>,
  nodeInternals: ReadonlyMap<
    string,
    Pick<Node, "height" | "sizeAuthority" | "width"> | undefined
  > = new Map(),
  sectionSizingPolicy: SectionSizingPolicy = DEFAULT_SECTION_SIZING_POLICY,
): Array<GraphSubstrateCanarySection> {
  return layoutSections.map((layoutSection) => {
    const {
      configuredHeight: _configuredHeight,
      configuredWidth: _configuredWidth,
      ...canarySection
    } = layoutSection;
    const { height, sizeAuthority, width } =
      resolveSettingsGraphSubstrateCanarySectionSize(
        layoutSection,
        nodeInternals.get(layoutSection.sectionId),
        sectionSizingPolicy,
      );

    return {
      ...canarySection,
      height,
      sizeAuthority,
      width,
    };
  });
}

export function getSettingsGraphSubstrateCanarySectionSizeAuthority(
  section: Pick<
    GraphSubstrateCanarySection,
    "height" | "sizeAuthority" | "width"
  >,
): SettingsGraphSubstrateCanarySectionSizeAuthority {
  if (section.sizeAuthority) {
    return section.sizeAuthority;
  }

  if (hasPositiveSectionSize(section.width, section.height)) {
    return "layout";
  }

  return "none";
}

function resolveSettingsGraphSubstrateCanarySectionSize(
  layoutSection: Pick<
    GraphSubstrateCanaryLayoutSection,
    | "configuredHeight"
    | "configuredWidth"
    | "height"
    | "sectionTypeName"
    | "width"
  >,
  currentNode: Pick<Node, "height" | "sizeAuthority" | "width"> | undefined,
  sectionSizingPolicy: SectionSizingPolicy,
): {
  height: number | null;
  sizeAuthority: SettingsGraphSubstrateCanarySectionSizeAuthority;
  width: number | null;
} {
  return resolveTopLevelSectionNodeSize({
    configuredSize: {
      height: layoutSection.configuredHeight,
      width: layoutSection.configuredWidth,
    },
    currentNode,
    layout: {
      h: layoutSection.height,
      w: layoutSection.width,
    },
    sectionSizingPolicy,
    sectionTypeName: layoutSection.sectionTypeName,
  });
}

function hasPositiveSectionSize(
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
