import {
  getSectionChromeStaticShellBorderClassName,
  resolveSectionChromeFrameStructure,
} from "components/Section/Container/sectionChrome";
import { useSectionChromeAppearance } from "components/Section/Container/sectionChromeAppearance";
import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";

type SettingsGraphSubstrateCanarySectionBorderProps = {
  section: SettingsGraphSubstrateCanarySceneSection;
};

function _SettingsGraphSubstrateCanarySectionBorder({
  section,
}: SettingsGraphSubstrateCanarySectionBorderProps) {
  const sectionTypeName = section.sectionTypeName ?? SectionTypeEnum.Code;
  const { hasSectionStyleTheme, sectionStyleVars, useMetaControlStyle } =
    useSectionChromeAppearance({
      sectionId: section.sectionId,
      sectionTypeName,
      styleColor: section.styleColor ?? null,
      textBlockMetaControlStyle: section.textBlockMetaControlStyle ?? false,
    });
  const frameStructure = resolveSectionChromeFrameStructure({
    positionAndSizeLocked: section.positionAndSizeLocked,
    useMetaControlStyle,
    hideBorder: false,
    hideFrameBorder: false,
  });

  if (
    !frameStructure.shellBorderVisible ||
    frameStructure.shellBorderTone === "transparent"
  ) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`transition-radius pointer-events-none absolute inset-0 border ${frameStructure.cornerStyle === "small" ? "rounded-sm" : "rounded-lg"} ${getSectionChromeStaticShellBorderClassName(
        {
          shellBorderTone: frameStructure.shellBorderTone,
          hasSectionStyleTheme,
        },
      )}`}
      data-border-tone={frameStructure.shellBorderTone}
      data-testid="graph-substrate-canary-section-border"
      style={sectionStyleVars}
    />
  );
}

export const SettingsGraphSubstrateCanarySectionBorder = React.memo(
  _SettingsGraphSubstrateCanarySectionBorder,
);
