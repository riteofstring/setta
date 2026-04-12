import { SectionContainer } from "components/Section/Container/SectionContainer";
import type { SectionContainerShellLayerSnapshot } from "components/Section/Container/SectionContainerCore";
import {
  resolveSectionChromeSurfaceDecorations,
  type SectionChromeBodySurface,
} from "components/Section/Container/sectionChrome";
import { useSectionChromeAppearance } from "components/Section/Container/sectionChromeAppearance";
import React, { useMemo } from "react";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { SettingsGraphSubstrateCanarySectionHeaderDomAdapter } from "./settingsGraphSubstrateCanarySectionHeaderAdapter";

export type SettingsGraphSubstrateCanarySectionBodyShellChromeOwner =
  | "section-body"
  | "shell-layer";

export type SettingsGraphSubstrateCanarySectionBody = {
  hasEmbeddedTerminal: boolean;
  isMinimized: boolean;
  isInOtherProjectConfigs: boolean;
  positionAndSizeLocked: boolean;
  sectionId: string;
  sectionTypeName: SectionType;
  shellChromeOwner: SettingsGraphSubstrateCanarySectionBodyShellChromeOwner;
  styleColor: string | null;
  textBlockMetaControlStyle: boolean;
};

export function resolveSettingsGraphSubstrateCanarySectionBody({
  hasEmbeddedTerminal,
  isMinimized,
  isInOtherProjectConfigs,
  positionAndSizeLocked,
  sectionId,
  sectionTypeName,
  shellChromeOwner,
  styleColor,
  textBlockMetaControlStyle,
}: SettingsGraphSubstrateCanarySectionBody): SettingsGraphSubstrateCanarySectionBody {
  return {
    hasEmbeddedTerminal,
    isMinimized,
    isInOtherProjectConfigs,
    positionAndSizeLocked,
    sectionId,
    sectionTypeName,
    shellChromeOwner,
    styleColor,
    textBlockMetaControlStyle,
  };
}

export function resolveSettingsGraphSubstrateCanarySectionBodySurface({
  bgColor,
  positionAndSizeLocked,
  sectionTypeName,
  useMetaControlStyle,
}: {
  bgColor: string;
  positionAndSizeLocked: boolean;
  sectionTypeName: SectionType;
  useMetaControlStyle: boolean;
}): SectionChromeBodySurface {
  return {
    bgColor,
    surfaceDecorations: resolveSectionChromeSurfaceDecorations({
      useMetaControlStyle,
      isMetaControlSection: sectionTypeName === SectionTypeEnum.MetaControl,
      isUserView: false,
      positionAndSizeLocked,
    }),
  };
}

function getSectionContainerChromeSuppression(
  shellChromeOwner: SettingsGraphSubstrateCanarySectionBodyShellChromeOwner,
) {
  switch (shellChromeOwner) {
    case "section-body":
      return {};
    case "shell-layer":
      return {
        forceHideOutline: true,
        forceHideFrameBorder: true,
        forceHideTopDragHandle: true,
        forceTransparentBorder: true,
      };
  }
}

function useSettingsGraphSubstrateCanarySectionBodySurface(
  sectionBody: SettingsGraphSubstrateCanarySectionBody,
): {
  bodySurface: SectionChromeBodySurface;
  shellLayerSnapshot: SectionContainerShellLayerSnapshot;
  shellLayerOwnsBackground: boolean;
} {
  const sectionChromeAppearance = useSectionChromeAppearance({
    sectionId: sectionBody.sectionId,
    sectionTypeName: sectionBody.sectionTypeName,
    styleColor: sectionBody.styleColor,
    textBlockMetaControlStyle: sectionBody.textBlockMetaControlStyle,
  });

  return useMemo(() => {
    const shellLayerOwnsBackground =
      sectionBody.shellChromeOwner === "shell-layer" &&
      sectionChromeAppearance.backgroundColor !== null;

    return {
      bodySurface: resolveSettingsGraphSubstrateCanarySectionBodySurface({
        bgColor: shellLayerOwnsBackground
          ? "bg-transparent"
          : sectionChromeAppearance.bgColor,
        positionAndSizeLocked: sectionBody.positionAndSizeLocked,
        sectionTypeName: sectionBody.sectionTypeName,
        useMetaControlStyle: sectionChromeAppearance.useMetaControlStyle,
      }),
      shellLayerSnapshot: {
        hasEmbeddedTerminal: sectionBody.hasEmbeddedTerminal,
        hasSectionStyleTheme: sectionChromeAppearance.hasSectionStyleTheme,
        isMinimized: sectionBody.isMinimized,
        isInOtherProjectConfigs: sectionBody.isInOtherProjectConfigs,
        positionAndSizeLocked: sectionBody.positionAndSizeLocked,
        sectionStyleVars: sectionChromeAppearance.sectionStyleVars,
        sectionTypeName: sectionBody.sectionTypeName,
        textBlockMetaControlStyle: sectionBody.textBlockMetaControlStyle,
      },
      shellLayerOwnsBackground,
    };
  }, [
    sectionBody.hasEmbeddedTerminal,
    sectionBody.isMinimized,
    sectionChromeAppearance.hasSectionStyleTheme,
    sectionBody.shellChromeOwner,
    sectionBody.isInOtherProjectConfigs,
    sectionChromeAppearance.bgColor,
    sectionChromeAppearance.backgroundColor,
    sectionChromeAppearance.sectionStyleVars,
    sectionChromeAppearance.useMetaControlStyle,
    sectionBody.positionAndSizeLocked,
    sectionBody.sectionTypeName,
    sectionBody.textBlockMetaControlStyle,
  ]);
}

type SettingsGraphSubstrateCanarySectionBodyDomAdapterProps = {
  sectionBody: SettingsGraphSubstrateCanarySectionBody;
};

function _SettingsGraphSubstrateCanarySectionBodyDomAdapter({
  sectionBody,
}: SettingsGraphSubstrateCanarySectionBodyDomAdapterProps) {
  const {
    bodySurface: bodySurfaceOverride,
    shellLayerOwnsBackground,
    shellLayerSnapshot,
  } = useSettingsGraphSubstrateCanarySectionBodySurface(sectionBody);

  return (
    <SectionContainer
      bodySurfaceOverride={bodySurfaceOverride}
      forceTransparentBackground={shellLayerOwnsBackground}
      headerRenderer={SettingsGraphSubstrateCanarySectionHeaderDomAdapter}
      sectionId={sectionBody.sectionId}
      isTopLevel={true}
      shellChromeOwner={sectionBody.shellChromeOwner}
      shellLayerSnapshot={
        sectionBody.shellChromeOwner === "shell-layer"
          ? shellLayerSnapshot
          : undefined
      }
      {...getSectionContainerChromeSuppression(sectionBody.shellChromeOwner)}
    />
  );
}

export const SettingsGraphSubstrateCanarySectionBodyDomAdapter = React.memo(
  _SettingsGraphSubstrateCanarySectionBodyDomAdapter,
  (previousProps, nextProps) =>
    previousProps.sectionBody.hasEmbeddedTerminal ===
      nextProps.sectionBody.hasEmbeddedTerminal &&
    previousProps.sectionBody.isMinimized ===
      nextProps.sectionBody.isMinimized &&
    previousProps.sectionBody.isInOtherProjectConfigs ===
      nextProps.sectionBody.isInOtherProjectConfigs &&
    previousProps.sectionBody.positionAndSizeLocked ===
      nextProps.sectionBody.positionAndSizeLocked &&
    previousProps.sectionBody.sectionId === nextProps.sectionBody.sectionId &&
    previousProps.sectionBody.sectionTypeName ===
      nextProps.sectionBody.sectionTypeName &&
    previousProps.sectionBody.shellChromeOwner ===
      nextProps.sectionBody.shellChromeOwner &&
    previousProps.sectionBody.styleColor === nextProps.sectionBody.styleColor &&
    previousProps.sectionBody.textBlockMetaControlStyle ===
      nextProps.sectionBody.textBlockMetaControlStyle,
);
