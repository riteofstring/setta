import {
  getSectionChromeStaticOutlineClassName,
  getSectionChromeStaticShellBorderClassName,
  getSectionChromeStaticTopDragHandleClassName,
  type SectionChromeOutlineTone,
  type SectionChromeResizeHandleTone,
  type SectionChromeShellBorderTone,
} from "components/Section/Container/sectionChrome";
import React from "react";
import type { SettingsGraphSubstrateCanarySectionShellAppearance } from "./settingsGraphSubstrateCanarySectionShellAppearance";

type SettingsGraphSubstrateCanarySectionShellLayerStyleVars =
  SettingsGraphSubstrateCanarySectionShellAppearance["sectionStyleVars"];

type SettingsGraphSubstrateCanarySectionShellBorderLayer = {
  className: string;
  shellBorderTone: SectionChromeShellBorderTone;
};

type SettingsGraphSubstrateCanarySectionShellOutlineLayer = {
  className: string;
  outlineTone: SectionChromeOutlineTone;
};

type SettingsGraphSubstrateCanarySectionShellTopDragHandleLayer = {
  innerClassName: string;
  outerClassName: string;
  resizeHandleTone: SectionChromeResizeHandleTone;
};

export type SettingsGraphSubstrateCanarySectionShellLayer = {
  border: SettingsGraphSubstrateCanarySectionShellBorderLayer | null;
  outline: SettingsGraphSubstrateCanarySectionShellOutlineLayer | null;
  sectionStyleVars: SettingsGraphSubstrateCanarySectionShellLayerStyleVars;
  topDragHandle: SettingsGraphSubstrateCanarySectionShellTopDragHandleLayer | null;
};

function getSectionShellCornerClassName(
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance,
) {
  return appearance.frameStructure.cornerStyle === "small"
    ? "rounded-sm"
    : "rounded-lg";
}

export function resolveSettingsGraphSubstrateCanarySectionShellLayer(
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance,
): SettingsGraphSubstrateCanarySectionShellLayer {
  const cornerClassName = getSectionShellCornerClassName(appearance);
  const border =
    appearance.frameStructure.shellBorderVisible &&
    appearance.frameStructure.shellBorderTone !== "transparent"
      ? {
          className: `transition-radius pointer-events-none absolute inset-0 border ${cornerClassName} ${getSectionChromeStaticShellBorderClassName(
            {
              shellBorderTone: appearance.frameStructure.shellBorderTone,
              hasSectionStyleTheme: appearance.hasSectionStyleTheme,
            },
          )}`,
          shellBorderTone: appearance.frameStructure.shellBorderTone,
        }
      : null;
  const outline =
    appearance.frameStructure.shellOutlineWidth === 0
      ? null
      : {
          className: `transition-radius pointer-events-none absolute inset-0 outline ${cornerClassName} ${appearance.frameStructure.shellOutlineWidth === 2 ? "outline-2" : "outline-4"} ${getSectionChromeStaticOutlineClassName(
            {
              outlineTone: appearance.shellDecorations.outlineTone,
              hasSectionStyleTheme: appearance.hasSectionStyleTheme,
            },
          )}`,
          outlineTone: appearance.shellDecorations.outlineTone,
        };
  const topDragHandle = appearance.surfaceDecorations.showTopDragHandle
    ? {
        innerClassName: `h-1 w-8 rounded-full ${getSectionChromeStaticTopDragHandleClassName(
          {
            resizeHandleTone: appearance.surfaceDecorations.resizeHandleTone,
            hasSectionStyleTheme: appearance.hasSectionStyleTheme,
          },
        )}`,
        outerClassName:
          "pointer-events-none absolute left-1/2 top-0 z-20 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center opacity-0 transition-opacity group-hover/canary-section:pointer-events-auto group-hover/canary-section:opacity-100",
        resizeHandleTone: appearance.surfaceDecorations.resizeHandleTone,
      }
    : null;

  return {
    border,
    outline,
    sectionStyleVars: appearance.sectionStyleVars,
    topDragHandle,
  };
}

type SettingsGraphSubstrateCanarySectionShellLayerDomAdapterProps = {
  shellLayer: SettingsGraphSubstrateCanarySectionShellLayer;
};

function _SettingsGraphSubstrateCanarySectionShellLayerDomAdapter({
  shellLayer,
}: SettingsGraphSubstrateCanarySectionShellLayerDomAdapterProps) {
  return (
    <>
      {shellLayer.border ? (
        <div
          aria-hidden="true"
          className={shellLayer.border.className}
          data-border-tone={shellLayer.border.shellBorderTone}
          data-testid="graph-substrate-canary-section-border"
          style={shellLayer.sectionStyleVars}
        />
      ) : null}
      {shellLayer.outline ? (
        <div
          aria-hidden="true"
          className={shellLayer.outline.className}
          data-outline-tone={shellLayer.outline.outlineTone}
          data-testid="graph-substrate-canary-section-outline"
          style={shellLayer.sectionStyleVars}
        />
      ) : null}
      {shellLayer.topDragHandle ? (
        <div
          aria-hidden="true"
          className={shellLayer.topDragHandle.outerClassName}
          data-resize-handle-tone={shellLayer.topDragHandle.resizeHandleTone}
          data-testid="graph-substrate-canary-section-top-drag-handle"
          style={shellLayer.sectionStyleVars}
        >
          <div className={shellLayer.topDragHandle.innerClassName} />
        </div>
      ) : null}
    </>
  );
}

export const SettingsGraphSubstrateCanarySectionShellLayerDomAdapter =
  React.memo(_SettingsGraphSubstrateCanarySectionShellLayerDomAdapter);
