import {
  getSectionChromeStaticTopDragHandleClassName,
  resolveSectionChromeSurfaceDecorations,
} from "components/Section/Container/sectionChrome";
import { useSectionChromeAppearance } from "components/Section/Container/sectionChromeAppearance";
import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";

type SettingsGraphSubstrateCanarySectionTopDragHandleProps = {
  section: SettingsGraphSubstrateCanarySceneSection;
};

function _SettingsGraphSubstrateCanarySectionTopDragHandle({
  section,
}: SettingsGraphSubstrateCanarySectionTopDragHandleProps) {
  const sectionTypeName = section.sectionTypeName ?? SectionTypeEnum.Code;
  const isMetaControlSection = sectionTypeName === SectionTypeEnum.MetaControl;
  const { hasSectionStyleTheme, sectionStyleVars, useMetaControlStyle } =
    useSectionChromeAppearance({
      sectionId: section.sectionId,
      sectionTypeName,
      styleColor: section.styleColor ?? null,
      textBlockMetaControlStyle: section.textBlockMetaControlStyle ?? false,
    });
  const surfaceDecorations = resolveSectionChromeSurfaceDecorations({
    useMetaControlStyle,
    isMetaControlSection,
    isUserView: false,
    positionAndSizeLocked: section.positionAndSizeLocked,
  });

  if (!surfaceDecorations.showTopDragHandle) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-0 z-20 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center opacity-0 transition-opacity group-hover/canary-section:pointer-events-auto group-hover/canary-section:opacity-100"
      data-resize-handle-tone={surfaceDecorations.resizeHandleTone}
      data-testid="graph-substrate-canary-section-top-drag-handle"
      style={sectionStyleVars}
    >
      <div
        className={`h-1 w-8 rounded-full ${getSectionChromeStaticTopDragHandleClassName(
          {
            resizeHandleTone: surfaceDecorations.resizeHandleTone,
            hasSectionStyleTheme,
          },
        )}`}
      />
    </div>
  );
}

export const SettingsGraphSubstrateCanarySectionTopDragHandle = React.memo(
  _SettingsGraphSubstrateCanarySectionTopDragHandle,
);
