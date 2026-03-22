import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import _ from "lodash";
import React from "react";
import {
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalForCodeSection,
} from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { SectionHeader } from "../Header/SectionHeader";
import { SectionWindowToggleButton } from "../Header/SectionWindowToggleButton";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";
import { MetaControlMenuButton } from "./MetaControlMenuButton";
import { SectionBodyGate } from "./SectionBodyGate";
import { getCanvasSectionChrome } from "./sectionChrome";
import { TextBlockMetaControlMenuButton } from "./TextBlockMetaControlMenuButton";

type SectionContainerCoreResizableProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  hasSectionStyleTheme: boolean;
  hideHeader?: boolean;
};

function _SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  positionAndSizeLocked,
  hasSectionStyleTheme,
  hideHeader = false,
}: SectionContainerCoreResizableProps) {
  const { isYouTube, textBlockMetaControlStyle, hasEmbeddedTerminal } =
    useProjectState((x) => {
      const impl = getCurrEffectiveSectionImpl(x, sectionId);
      const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
        x,
        sectionId,
      );
      return {
        isYouTube: false,
        textBlockMetaControlStyle:
          impl.type === SectionTypeEnum.TextBlock
            ? impl.metaControlStyle
            : false,
        hasEmbeddedTerminal:
          embeddedTerminal !== null && !embeddedTerminal.isTerminalMinimized,
      };
    }, _.isEqual);

  const isRoot = getIsRoot(sectionTypeName);
  const sectionChrome = getCanvasSectionChrome({
    sectionTypeName,
    textBlockMetaControlStyle,
    isUserView,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    hideHeader,
  });

  return (
    <CustomResizable
      sectionId={sectionId}
      as="section"
      isYouTube={isYouTube}
      useMetaControlStyle={sectionChrome.useMetaControlStyle}
      positionAndSizeLocked={positionAndSizeLocked}
      allowPointerEventsDuringDnd={hasEmbeddedTerminal}
      surfaceClassName={sectionChrome.surfaceClassName}
    >
      {sectionChrome.showMetaControlDragHandle && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center opacity-0 transition-opacity group-hover/card-section:pointer-events-auto group-hover/card-section:opacity-100">
          <div className="h-1 w-8 rounded-full bg-setta-300/70 dark:bg-setta-600/70" />
        </div>
      )}
      <CanvasSectionChromeControl
        headerVariant={sectionChrome.headerVariant}
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        isRoot={isRoot}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
      {isRoot && <Incrementer sectionId={sectionId} isRoot={isRoot} />}
      <SectionBodyGate
        sectionId={sectionId}
        owner={{
          kind: "canvas",
          bgColor: sectionChrome.bgColor,
          isUserView,
        }}
      />
    </CustomResizable>
  );
}

export const SectionContainerCoreResizable = React.memo(
  _SectionContainerCoreResizable,
);

function CanvasSectionChromeControl({
  headerVariant,
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  isRoot,
  hasSectionStyleTheme,
}: {
  headerVariant:
    | "metaControlMenu"
    | "textBlockMetaControlMenu"
    | "sectionHeader"
    | "none";
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  isRoot: boolean;
  hasSectionStyleTheme: boolean;
}) {
  switch (headerVariant) {
    case "metaControlMenu":
      return (
        <CanvasSectionOutboardMenu>
          <MetaControlMenuButton
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            isInOtherProjectConfigs={isInOtherProjectConfigs}
          />
        </CanvasSectionOutboardMenu>
      );
    case "textBlockMetaControlMenu":
      return (
        <CanvasSectionOutboardMenu>
          <TextBlockMetaControlMenuButton
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            isInOtherProjectConfigs={isInOtherProjectConfigs}
            isRoot={isRoot}
          />
        </CanvasSectionOutboardMenu>
      );
    case "sectionHeader":
      return (
        <SectionHeader
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isUserView={isUserView}
          isRoot={isRoot}
          hasSectionStyleTheme={hasSectionStyleTheme}
          extraControls={
            !isUserView ? (
              <SectionWindowToggleButton
                sectionId={sectionId}
                sectionTypeName={sectionTypeName}
                isRoot={isRoot}
                hasSectionStyleTheme={hasSectionStyleTheme}
              />
            ) : null
          }
        />
      );
    case "none":
      return null;
  }
}

function CanvasSectionOutboardMenu({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="absolute left-0 top-1/2 z-[200] -translate-x-full -translate-y-1/2">
      <div className="flex h-12 w-10 items-center justify-end">{children}</div>
    </div>
  );
}
