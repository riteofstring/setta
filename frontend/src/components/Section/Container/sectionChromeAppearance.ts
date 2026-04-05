import type React from "react";
import { useLocalStorage, useTemporaryMiscState } from "state/definitions";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { getBgColor } from "./utils";

type ResolveSectionChromeAppearanceArgs = {
  darkMode: boolean;
  previewStyleColor: string | null | undefined;
  sectionTypeName: SectionType;
  styleColor: string | null | undefined;
  textBlockMetaControlStyle: boolean;
};

type UseSectionChromeAppearanceArgs = Pick<
  ResolveSectionChromeAppearanceArgs,
  "sectionTypeName" | "styleColor" | "textBlockMetaControlStyle"
> & {
  sectionId: string;
};

export type SectionChromeAppearance = {
  bgColor: string;
  hasSectionStyleTheme: boolean;
  sectionStyleVars: React.CSSProperties | undefined;
  useMetaControlStyle: boolean;
};

export function resolveSectionChromeAppearance({
  darkMode,
  previewStyleColor,
  sectionTypeName,
  styleColor,
  textBlockMetaControlStyle,
}: ResolveSectionChromeAppearanceArgs): SectionChromeAppearance {
  const useMetaControlStyle =
    sectionTypeName === SectionTypeEnum.MetaControl ||
    textBlockMetaControlStyle;
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  const sectionStyleTheme =
    resolvedStyleColor && !useMetaControlStyle
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null;

  return {
    bgColor: useMetaControlStyle
      ? "bg-transparent"
      : getBgColor(sectionTypeName),
    hasSectionStyleTheme: sectionStyleTheme !== null,
    sectionStyleVars: sectionStyleTheme
      ? ({
          "--setta-section-style-bg": sectionStyleTheme.bg,
          "--setta-section-style-panel-bg": sectionStyleTheme.panelBg,
          "--setta-section-style-border": sectionStyleTheme.border,
          "--setta-section-style-outline": sectionStyleTheme.outline,
          "--setta-section-style-text": sectionStyleTheme.text,
          "--setta-section-style-muted-text": sectionStyleTheme.mutedText,
          "--setta-section-style-arg-handle": sectionStyleTheme.border,
          "--setta-section-style-arg-handle-hover": sectionStyleTheme.outline,
          "--setta-section-style-arg-handle-active": sectionStyleTheme.border,
          "--setta-section-style-agentic-handle": sectionStyleTheme.outline,
        } as React.CSSProperties)
      : undefined,
    useMetaControlStyle,
  };
}

export function useSectionChromeAppearance({
  sectionId,
  sectionTypeName,
  styleColor,
  textBlockMetaControlStyle,
}: UseSectionChromeAppearanceArgs): SectionChromeAppearance {
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (state) => state[styleColorPreviewKey] as string | null | undefined,
  );
  const darkMode = useLocalStorage((state) => state.darkMode);

  return resolveSectionChromeAppearance({
    darkMode,
    previewStyleColor,
    sectionTypeName,
    styleColor,
    textBlockMetaControlStyle,
  });
}
