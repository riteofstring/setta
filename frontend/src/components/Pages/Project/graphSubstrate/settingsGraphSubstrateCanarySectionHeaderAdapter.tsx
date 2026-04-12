import type { SectionContainerHeaderRenderProps } from "components/Section/Container/SectionContainerCoreResizabe";
import { SectionHeader } from "components/Section/Header/SectionHeader";
import { SectionWindowToggleButton } from "components/Section/Header/SectionWindowToggleButton";
import React from "react";

export type SettingsGraphSubstrateCanarySectionHeader = {
  hasSectionStyleTheme: boolean;
  isInOtherProjectConfigs: boolean;
  isRoot: boolean;
  isUserView: boolean;
  sectionId: string;
  sectionTypeName: SectionContainerHeaderRenderProps["sectionTypeName"];
  showWindowToggle: boolean;
};

export function resolveSettingsGraphSubstrateCanarySectionHeader({
  hasSectionStyleTheme,
  isInOtherProjectConfigs,
  isRoot,
  isUserView,
  sectionId,
  sectionTypeName,
}: SectionContainerHeaderRenderProps): SettingsGraphSubstrateCanarySectionHeader {
  return {
    hasSectionStyleTheme,
    isInOtherProjectConfigs,
    isRoot,
    isUserView,
    sectionId,
    sectionTypeName,
    showWindowToggle: !isUserView,
  };
}

function _SettingsGraphSubstrateCanarySectionHeaderDomAdapter(
  props: SectionContainerHeaderRenderProps,
) {
  const sectionHeader = resolveSettingsGraphSubstrateCanarySectionHeader(props);

  return (
    <SectionHeader
      sectionId={sectionHeader.sectionId}
      sectionTypeName={sectionHeader.sectionTypeName}
      isInOtherProjectConfigs={sectionHeader.isInOtherProjectConfigs}
      isUserView={sectionHeader.isUserView}
      isRoot={sectionHeader.isRoot}
      hasSectionStyleTheme={sectionHeader.hasSectionStyleTheme}
      extraControls={
        sectionHeader.showWindowToggle ? (
          <SectionWindowToggleButton
            sectionId={sectionHeader.sectionId}
            sectionTypeName={sectionHeader.sectionTypeName}
            isRoot={sectionHeader.isRoot}
            hasSectionStyleTheme={sectionHeader.hasSectionStyleTheme}
          />
        ) : null
      }
    />
  );
}

export const SettingsGraphSubstrateCanarySectionHeaderDomAdapter = React.memo(
  _SettingsGraphSubstrateCanarySectionHeaderDomAdapter,
  (previousProps, nextProps) =>
    previousProps.hasSectionStyleTheme === nextProps.hasSectionStyleTheme &&
    previousProps.isInOtherProjectConfigs ===
      nextProps.isInOtherProjectConfigs &&
    previousProps.isRoot === nextProps.isRoot &&
    previousProps.isUserView === nextProps.isUserView &&
    previousProps.sectionId === nextProps.sectionId &&
    previousProps.sectionTypeName === nextProps.sectionTypeName,
);
