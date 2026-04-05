import {
  resolveSectionChromeFrameStructure,
  resolveSectionChromeShellDecorations,
  resolveSectionChromeSurfaceDecorations,
  type SectionChromeFrameStructure,
  type SectionChromeShellDecorations,
  type SectionChromeSurfaceDecorations,
} from "components/Section/Container/sectionChrome";
import {
  useSectionChromeAppearance,
  type SectionChromeAppearance,
} from "components/Section/Container/sectionChromeAppearance";
import { useMemo, type CSSProperties } from "react";
import { useIsSectionUIActive } from "state/activeSectionUI";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";

type ResolveSettingsGraphSubstrateCanarySectionShellAppearanceArgs = Pick<
  SectionChromeAppearance,
  "hasSectionStyleTheme" | "sectionStyleVars" | "useMetaControlStyle"
> & {
  isActiveSection: boolean;
  isInOtherProjectConfigs: boolean;
  positionAndSizeLocked: boolean;
  sectionTypeName: SectionType;
};

export type SettingsGraphSubstrateCanarySectionShellAppearance = {
  frameStructure: SectionChromeFrameStructure;
  hasSectionStyleTheme: boolean;
  sectionStyleVars: CSSProperties | undefined;
  shellDecorations: SectionChromeShellDecorations;
  surfaceDecorations: SectionChromeSurfaceDecorations;
};

export function resolveSettingsGraphSubstrateCanarySectionShellAppearance({
  hasSectionStyleTheme,
  isActiveSection,
  isInOtherProjectConfigs,
  positionAndSizeLocked,
  sectionStyleVars,
  sectionTypeName,
  useMetaControlStyle,
}: ResolveSettingsGraphSubstrateCanarySectionShellAppearanceArgs): SettingsGraphSubstrateCanarySectionShellAppearance {
  return {
    frameStructure: resolveSectionChromeFrameStructure({
      positionAndSizeLocked,
      useMetaControlStyle,
      hideBorder: false,
      hideFrameBorder: false,
    }),
    hasSectionStyleTheme,
    sectionStyleVars,
    shellDecorations: resolveSectionChromeShellDecorations({
      isActiveSection,
      isGlobalVariables: sectionTypeName === SectionTypeEnum.GlobalVariables,
      isInOtherProjectConfigs,
      showAiHighlight: false,
      isReadScope: false,
      isWriteScope: false,
    }),
    surfaceDecorations: resolveSectionChromeSurfaceDecorations({
      useMetaControlStyle,
      isMetaControlSection: sectionTypeName === SectionTypeEnum.MetaControl,
      isUserView: false,
      positionAndSizeLocked,
    }),
  };
}

export function useSettingsGraphSubstrateCanarySectionShellAppearance(
  section: SettingsGraphSubstrateCanarySceneSection,
): SettingsGraphSubstrateCanarySectionShellAppearance {
  const sectionTypeName = section.sectionTypeName ?? SectionTypeEnum.Code;
  const isActiveSection =
    useIsSectionUIActive(section.sectionId) || section.isActiveSection === true;
  const sectionChromeAppearance = useSectionChromeAppearance({
    sectionId: section.sectionId,
    sectionTypeName,
    styleColor: section.styleColor ?? null,
    textBlockMetaControlStyle: section.textBlockMetaControlStyle ?? false,
  });

  return useMemo(() => {
    return resolveSettingsGraphSubstrateCanarySectionShellAppearance({
      hasSectionStyleTheme: sectionChromeAppearance.hasSectionStyleTheme,
      isActiveSection,
      isInOtherProjectConfigs: section.isInOtherProjectConfigs ?? false,
      positionAndSizeLocked: section.positionAndSizeLocked,
      sectionStyleVars: sectionChromeAppearance.sectionStyleVars,
      sectionTypeName,
      useMetaControlStyle: sectionChromeAppearance.useMetaControlStyle,
    });
  }, [
    isActiveSection,
    section.isInOtherProjectConfigs,
    section.positionAndSizeLocked,
    sectionChromeAppearance.hasSectionStyleTheme,
    sectionChromeAppearance.sectionStyleVars,
    sectionChromeAppearance.useMetaControlStyle,
    sectionTypeName,
  ]);
}
