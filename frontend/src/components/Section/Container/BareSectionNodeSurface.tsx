import { EdgesStrip } from "components/Params/EdgesStrip";
import type React from "react";
import {
  BARE_SECTION_NODE_MIN_HEIGHT,
  BARE_SECTION_NODE_MIN_WIDTH,
} from "utils/bareSectionNodes";
import type { SectionType } from "utils/generatedTypes";
import { BareSectionNodeHeader } from "./BareSectionNodeHeader";

type BareSectionNodeSurfaceProps = {
  bgColor: string;
  hasSectionStyleTheme: boolean;
  isInOtherProjectConfigs: boolean;
  isMinimized: boolean;
  sectionId: string;
  sectionTypeName: SectionType;
};

function getBareNodeBgColorClassName(
  bgColor: string,
  hasSectionStyleTheme: boolean,
) {
  return hasSectionStyleTheme
    ? "bg-[color:var(--setta-section-style-bg)]"
    : bgColor;
}

export function BareSectionNodeSurface({
  bgColor,
  hasSectionStyleTheme,
  isInOtherProjectConfigs,
  isMinimized,
  sectionId,
  sectionTypeName,
}: BareSectionNodeSurfaceProps) {
  const style = {
    minHeight: BARE_SECTION_NODE_MIN_HEIGHT,
    minWidth: BARE_SECTION_NODE_MIN_WIDTH,
  } satisfies React.CSSProperties;

  return (
    <div
      className={`relative flex flex-col overflow-visible rounded-[inherit] ${getBareNodeBgColorClassName(bgColor, hasSectionStyleTheme)}`}
      data-testid="bare-section-node-surface"
      style={style}
    >
      <BareSectionNodeHeader
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
      {isMinimized ? null : (
        <EdgesStrip
          sectionId={sectionId}
          bgColor={bgColor}
          variant="bare-node"
        />
      )}
    </div>
  );
}
