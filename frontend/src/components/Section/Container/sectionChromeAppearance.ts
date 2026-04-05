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
  backgroundColor: string | null;
  bgColor: string;
  hasSectionStyleTheme: boolean;
  sectionStyleVars: React.CSSProperties | undefined;
  surfaceFrameColor: SectionChromeStaticColor | null;
  surfaceFrameHoverColor: SectionChromeStaticColor | null;
  useMetaControlStyle: boolean;
};

export type SectionChromeStaticColor = {
  alpha: number;
  color: string;
};

const SETTA_50 = "hsl(222, 28%, 95%)";
const SETTA_860 = "hsl(220, 25%, 8.5%)";
const SETTA_900 = "hsl(220, 27%, 6%)";
const SETTA_950 = "hsl(220, 25%, 3%)";
const SETTA_400 = "hsl(220, 26%, 57%)";
const SETTA_700 = "hsl(219, 26%, 23%)";
const STONE_100 = "#f5f5f4";
const STONE_900 = "#171717";
const WHITE = "#ffffff";

function resolveSectionChromeBackgroundColor({
  darkMode,
  sectionTypeName,
  sectionStyleBackgroundColor,
  useMetaControlStyle,
}: {
  darkMode: boolean;
  sectionTypeName: SectionType;
  sectionStyleBackgroundColor: string | null;
  useMetaControlStyle: boolean;
}) {
  if (sectionStyleBackgroundColor !== null) {
    return sectionStyleBackgroundColor;
  }

  if (useMetaControlStyle) {
    return null;
  }

  switch (sectionTypeName) {
    case SectionTypeEnum.Code:
    case SectionTypeEnum.GenPythonCode:
    case SectionTypeEnum.GenPythonMetadata:
      return darkMode ? SETTA_900 : "#ffffff";
    case SectionTypeEnum.Terminal:
      return SETTA_950;
    case SectionTypeEnum.Browser:
      return null;
    case SectionTypeEnum.GlobalVariables:
      return darkMode ? "#000000" : "#ffffff";
    case SectionTypeEnum.StateMachineStart:
    case SectionTypeEnum.StateMachineGate:
    case SectionTypeEnum.StateMachineEnd:
      return darkMode ? STONE_900 : STONE_100;
    default:
      return darkMode ? SETTA_860 : SETTA_50;
  }
}

function resolveSectionChromeSurfaceFrameColors({
  darkMode,
  sectionStyleBorderColor,
  useMetaControlStyle,
}: {
  darkMode: boolean;
  sectionStyleBorderColor: string | null;
  useMetaControlStyle: boolean;
}): {
  surfaceFrameColor: SectionChromeStaticColor | null;
  surfaceFrameHoverColor: SectionChromeStaticColor | null;
} {
  if (sectionStyleBorderColor !== null) {
    return {
      surfaceFrameColor: {
        alpha: 1,
        color: sectionStyleBorderColor,
      },
      surfaceFrameHoverColor: null,
    };
  }

  if (useMetaControlStyle) {
    return {
      surfaceFrameColor: null,
      surfaceFrameHoverColor: {
        alpha: 0.6,
        color: darkMode ? SETTA_700 : SETTA_400,
      },
    };
  }

  return {
    surfaceFrameColor: {
      alpha: 1,
      color: darkMode ? SETTA_700 : WHITE,
    },
    surfaceFrameHoverColor: null,
  };
}

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
  const { surfaceFrameColor, surfaceFrameHoverColor } =
    resolveSectionChromeSurfaceFrameColors({
      darkMode,
      sectionStyleBorderColor: sectionStyleTheme?.border ?? null,
      useMetaControlStyle,
    });

  return {
    backgroundColor: resolveSectionChromeBackgroundColor({
      darkMode,
      sectionTypeName,
      sectionStyleBackgroundColor: sectionStyleTheme?.bg ?? null,
      useMetaControlStyle,
    }),
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
    surfaceFrameColor,
    surfaceFrameHoverColor,
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
