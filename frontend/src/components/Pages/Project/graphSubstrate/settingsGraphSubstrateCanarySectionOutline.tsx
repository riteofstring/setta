import {
  getSectionChromeStaticOutlineClassName,
  resolveSectionChromeFrameStructure,
  resolveSectionChromeShellDecorations,
} from "components/Section/Container/sectionChrome";
import { useSectionChromeAppearance } from "components/Section/Container/sectionChromeAppearance";
import React from "react";
import { useIsSectionUIActive } from "state/activeSectionUI";
import { SectionTypeEnum } from "utils/generatedTypes";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";

type SettingsGraphSubstrateCanarySectionOutlineProps = {
  section: SettingsGraphSubstrateCanarySceneSection;
};

function _SettingsGraphSubstrateCanarySectionOutline({
  section,
}: SettingsGraphSubstrateCanarySectionOutlineProps) {
  const sectionTypeName = section.sectionTypeName ?? SectionTypeEnum.Code;
  const isActiveSection =
    useIsSectionUIActive(section.sectionId) || section.isActiveSection === true;
  const { hasSectionStyleTheme, sectionStyleVars, useMetaControlStyle } =
    useSectionChromeAppearance({
      sectionId: section.sectionId,
      sectionTypeName,
      styleColor: section.styleColor ?? null,
      textBlockMetaControlStyle: section.textBlockMetaControlStyle ?? false,
    });
  const shellDecorations = resolveSectionChromeShellDecorations({
    isActiveSection,
    isGlobalVariables: sectionTypeName === SectionTypeEnum.GlobalVariables,
    isInOtherProjectConfigs: section.isInOtherProjectConfigs ?? false,
    showAiHighlight: false,
    isReadScope: false,
    isWriteScope: false,
  });
  const frameStructure = resolveSectionChromeFrameStructure({
    positionAndSizeLocked: section.positionAndSizeLocked,
    useMetaControlStyle,
    hideBorder: false,
    hideFrameBorder: false,
  });

  if (frameStructure.shellOutlineWidth === 0) {
    return null;
  }

  const outlineWidthClassName =
    frameStructure.shellOutlineWidth === 2 ? "outline-2" : "outline-4";

  return (
    <div
      aria-hidden="true"
      className={`transition-radius pointer-events-none absolute inset-0 outline ${frameStructure.cornerStyle === "small" ? "rounded-sm" : "rounded-lg"} ${outlineWidthClassName} ${getSectionChromeStaticOutlineClassName(
        {
          outlineTone: shellDecorations.outlineTone,
          hasSectionStyleTheme,
        },
      )}`}
      data-outline-tone={shellDecorations.outlineTone}
      data-testid="graph-substrate-canary-section-outline"
      style={sectionStyleVars}
    />
  );
}

export const SettingsGraphSubstrateCanarySectionOutline = React.memo(
  _SettingsGraphSubstrateCanarySectionOutline,
);
