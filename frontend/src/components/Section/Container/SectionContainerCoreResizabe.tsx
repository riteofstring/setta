import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import _ from "lodash";
import React from "react";
import { getExternalProjectChatWindowBindingForSectionInState } from "state/actions/projectChatWindowing";
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
import {
  SectionContainerArea,
  type SectionContainerAreaProps,
} from "./SectionContainerArea";
import { SectionWindowPlaceholder } from "./SectionWindowPlaceholder";
import { TextBlockMetaControlMenuButton } from "./TextBlockMetaControlMenuButton";
import { getBgColor } from "./utils";

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
  const benchmark = useSettingsAllSettingsBenchmark();
  const {
    isMinimized,
    isYouTube,
    textBlockMetaControlStyle,
    hasEmbeddedTerminal,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
      x,
      sectionId,
    );
    return {
      isMinimized: impl.isMinimized,
      isYouTube: false,
      textBlockMetaControlStyle:
        impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
      hasEmbeddedTerminal:
        embeddedTerminal !== null && !embeddedTerminal.isTerminalMinimized,
    };
  }, _.isEqual);

  const isMetaControl = sectionTypeName === SectionTypeEnum.MetaControl;
  const isRoot = getIsRoot(sectionTypeName);
  const useMetaControlStyle = isMetaControl || textBlockMetaControlStyle;
  const bgColor = useMetaControlStyle
    ? "bg-transparent"
    : getBgColor(sectionTypeName);
  const shouldRenderMetaMenu = isMetaControl && !isUserView;
  const shouldRenderTextBlockMetaMenu =
    textBlockMetaControlStyle && !isUserView;
  const showMetaControlDragHandle =
    useMetaControlStyle && !isUserView && !positionAndSizeLocked;
  const metaControlFrameClassName = useMetaControlStyle
    ? "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60"
    : undefined;
  const metaControlLayoutClassName = isMetaControl
    ? "grid-cols-1 grid-rows-1"
    : undefined;
  const shouldRenderHeader =
    !hideHeader && (!benchmark.active || benchmark.renderSectionHeader);
  const shouldRenderIncrementer =
    isRoot && (!benchmark.active || benchmark.renderFullSectionBody);
  const shouldRenderCanvasSectionBody =
    !benchmark.active ||
    benchmark.renderFullSectionBody ||
    benchmark.renderSectionBody;
  const shouldRenderBenchmarkPlaceholder =
    benchmark.active &&
    !benchmark.renderFullSectionBody &&
    !benchmark.renderSectionBody &&
    !isMetaControl;

  return (
    <CustomResizable
      sectionId={sectionId}
      as="section"
      bgColor={bgColor}
      isYouTube={isYouTube}
      isMetaControl={useMetaControlStyle}
      positionAndSizeLocked={positionAndSizeLocked}
      hasSectionStyleTheme={hasSectionStyleTheme}
      allowPointerEventsDuringDnd={hasEmbeddedTerminal}
      frameClassName={metaControlFrameClassName}
      layoutClassName={metaControlLayoutClassName}
    >
      {showMetaControlDragHandle && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center opacity-0 transition-opacity group-hover/card-section:pointer-events-auto group-hover/card-section:opacity-100">
          <div className="h-1 w-8 rounded-full bg-setta-300/70 dark:bg-setta-600/70" />
        </div>
      )}
      {isMetaControl ? (
        shouldRenderMetaMenu && (
          <div className="absolute left-0 top-1/2 z-[200] -translate-x-full -translate-y-1/2">
            <div className="flex h-12 w-10 items-center justify-end">
              <MetaControlMenuButton
                sectionId={sectionId}
                sectionTypeName={sectionTypeName}
                isInOtherProjectConfigs={isInOtherProjectConfigs}
              />
            </div>
          </div>
        )
      ) : textBlockMetaControlStyle ? (
        shouldRenderTextBlockMetaMenu && (
          <div className="absolute left-0 top-1/2 z-[200] -translate-x-full -translate-y-1/2">
            <div className="flex h-12 w-10 items-center justify-end">
              <TextBlockMetaControlMenuButton
                sectionId={sectionId}
                sectionTypeName={sectionTypeName}
                isInOtherProjectConfigs={isInOtherProjectConfigs}
                isRoot={isRoot}
              />
            </div>
          </div>
        )
      ) : shouldRenderHeader ? (
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
      ) : null}
      {shouldRenderIncrementer ? (
        <Incrementer sectionId={sectionId} isRoot={isRoot} />
      ) : null}
      {shouldRenderCanvasSectionBody ? (
        <CanvasSectionBody
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          bgColor={bgColor}
          isMinimized={isMinimized}
          isUserView={isUserView}
        />
      ) : shouldRenderBenchmarkPlaceholder ? (
        <BenchmarkSectionBodyPlaceholder stage={benchmark.stage} />
      ) : null}
    </CustomResizable>
  );
}

export const SectionContainerCoreResizable = React.memo(
  _SectionContainerCoreResizable,
);

function BenchmarkSectionBodyPlaceholder({
  stage,
}: {
  stage:
    | "frame-only"
    | "header-only"
    | "section-body-shell"
    | "static-param-list"
    | "full";
}) {
  return (
    <div
      className="section-row-pin-main flex min-h-12 w-full items-center justify-center px-3 py-3 text-[0.6rem] uppercase tracking-[0.18em] text-setta-300 dark:text-setta-600"
      data-settings-benchmark-placeholder={stage}
    >
      {stage === "frame-only" ? "Frame only" : "Header only"}
    </div>
  );
}

export type AreaSwitchProps = SectionContainerAreaProps;

export function AreaSwitch({
  isMinimized,
  chatHost = "section_layout",
  ...areaProps
}: AreaSwitchProps) {
  if (isMinimized) {
    return null;
  }
  return (
    <SectionContainerArea
      {...areaProps}
      isMinimized={isMinimized}
      chatHost={chatHost}
    />
  );
}

function CanvasSectionBody({
  sectionId,
  sectionTypeName,
  bgColor,
  isMinimized,
  isUserView,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
  isMinimized: boolean;
  isUserView: boolean;
}) {
  const externalizedWindowId = useProjectState((state) => {
    if (sectionTypeName === SectionTypeEnum.Chat) {
      return null;
    }
    return (
      getExternalProjectChatWindowBindingForSectionInState(
        state.projectChatWindowing,
        sectionId,
      )?.instanceId ?? null
    );
  });

  if (externalizedWindowId) {
    return (
      <SectionWindowPlaceholder
        instanceId={externalizedWindowId}
        sectionId={sectionId}
        dataTestId="section-canvas-window-placeholder"
      />
    );
  }
  if (isMinimized) {
    return null;
  }

  return (
    <AreaSwitch
      sectionId={sectionId}
      sectionTypeName={sectionTypeName}
      bgColor={bgColor}
      isMinimized={isMinimized}
      isUserView={isUserView}
    />
  );
}
