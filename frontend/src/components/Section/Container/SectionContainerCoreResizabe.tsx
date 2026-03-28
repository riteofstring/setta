import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import _ from "lodash";
import React from "react";
import { getEmbeddedAttachedTerminalForCodeSection } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import type { SectionType } from "utils/generatedTypes";
import { SectionHeader } from "../Header/SectionHeader";
import { SectionWindowToggleButton } from "../Header/SectionWindowToggleButton";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";
import { MetaControlMenuButton } from "./MetaControlMenuButton";
import { buildSectionContainerCoreResizableView } from "./sectionContainerCoreResizableView";
import { TextBlockMetaControlMenuButton } from "./TextBlockMetaControlMenuButton";

type SectionContainerCoreResizableProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  hasSectionStyleTheme: boolean;
  textBlockMetaControlStyle: boolean;
  hideHeader?: boolean;
  children: React.ReactNode;
};

function _SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  bgColor,
  isInOtherProjectConfigs,
  isUserView,
  positionAndSizeLocked,
  hasSectionStyleTheme,
  textBlockMetaControlStyle,
  hideHeader = false,
  children,
}: SectionContainerCoreResizableProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const { hasEmbeddedTerminal } = useProjectState((x) => {
    const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
      x,
      sectionId,
    );
    return {
      hasEmbeddedTerminal:
        embeddedTerminal !== null && !embeddedTerminal.isTerminalMinimized,
    };
  }, _.isEqual);
  const view = buildSectionContainerCoreResizableView({
    sectionTypeName,
    textBlockMetaControlStyle,
    isUserView,
    positionAndSizeLocked,
    hideHeader,
    benchmarkActive: benchmark.active,
    renderSectionHeader: benchmark.renderSectionHeader,
    renderFullSectionBody: benchmark.renderFullSectionBody,
  });

  return (
    <CustomResizable
      sectionId={sectionId}
      as="section"
      bgColor={bgColor}
      isYouTube={false}
      isMetaControl={view.useMetaControlStyle}
      positionAndSizeLocked={positionAndSizeLocked}
      hasSectionStyleTheme={hasSectionStyleTheme}
      allowPointerEventsDuringDnd={hasEmbeddedTerminal}
      frameClassName={view.frameClassName}
      layoutClassName={view.layoutClassName}
    >
      {view.showMetaControlDragHandle && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center opacity-0 transition-opacity group-hover/card-section:pointer-events-auto group-hover/card-section:opacity-100">
          <div className="h-1 w-8 rounded-full bg-setta-300/70 dark:bg-setta-600/70" />
        </div>
      )}
      {view.headerKind === "meta-control-menu" ? (
        <div className="absolute left-0 top-1/2 z-[200] -translate-x-full -translate-y-1/2">
          <div className="flex h-12 w-10 items-center justify-end">
            <MetaControlMenuButton
              sectionId={sectionId}
              sectionTypeName={sectionTypeName}
              isInOtherProjectConfigs={isInOtherProjectConfigs}
            />
          </div>
        </div>
      ) : view.headerKind === "text-block-meta-control-menu" ? (
        <div className="absolute left-0 top-1/2 z-[200] -translate-x-full -translate-y-1/2">
          <div className="flex h-12 w-10 items-center justify-end">
            <TextBlockMetaControlMenuButton
              sectionId={sectionId}
              sectionTypeName={sectionTypeName}
              isInOtherProjectConfigs={isInOtherProjectConfigs}
              isRoot={view.isRoot}
            />
          </div>
        </div>
      ) : view.headerKind === "section-header" ? (
        <SectionHeader
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isUserView={isUserView}
          isRoot={view.isRoot}
          hasSectionStyleTheme={hasSectionStyleTheme}
          extraControls={
            !isUserView ? (
              <SectionWindowToggleButton
                sectionId={sectionId}
                sectionTypeName={sectionTypeName}
                isRoot={view.isRoot}
                hasSectionStyleTheme={hasSectionStyleTheme}
              />
            ) : null
          }
        />
      ) : null}
      {view.shouldRenderIncrementer ? (
        <Incrementer sectionId={sectionId} isRoot={view.isRoot} />
      ) : null}
      {children}
    </CustomResizable>
  );
}

export const SectionContainerCoreResizable = React.memo(
  _SectionContainerCoreResizable,
);
