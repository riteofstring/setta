import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import _ from "lodash";
import { useState } from "react";
import { TbChevronLeft, TbChevronRight } from "react-icons/tb";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { SectionHeader } from "../Header/SectionHeader";
import { BrowserArea } from "../Layouts/BrowserArea";
import { CallableArea } from "../Layouts/CallableArea";
import { ChartArea } from "../Layouts/ChartArea/ChartArea";
import { ChatArea } from "../Layouts/ChatArea";
import { CodeArea, GenPythonCodeArea } from "../Layouts/CodeArea";
import { DictArea } from "../Layouts/DictArea";
import { DrawArea } from "../Layouts/DrawArea/DrawArea";
import { GlobalVariablesArea } from "../Layouts/GlobalVariablesArea";
import { IframeArea } from "../Layouts/IframeArea";
import { ImageArea } from "../Layouts/ImageArea";
import { MetaControlArea } from "../Layouts/MetaControlArea";
import { SocialArea } from "../Layouts/SocialArea";
import { TerminalArea } from "../Layouts/TerminalArea";
import { TextBlock } from "../Layouts/TextBlock";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";
import { getBgColor } from "./utils";

type SectionContainerCoreResizableProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isActiveSection: boolean;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
};

export function SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  isActiveSection,
  isInOtherProjectConfigs,
  isUserView,
  positionAndSizeLocked,
}: SectionContainerCoreResizableProps) {
  const { isMinimized, isYouTube } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      isMinimized: impl.isMinimized,
      isYouTube: false,
      // isYouTube: getIsYouTubeSection(sectionId, x),
    };
  }, _.isEqual);

  const isMetaControl = sectionTypeName === SectionTypeEnum.MetaControl;
  const isRoot = getIsRoot(sectionTypeName);
  const bgColor = getBgColor(sectionTypeName);
  const [isMetaHeaderOpen, setIsMetaHeaderOpen] = useState(false);
  const shouldRenderMetaHeader = isMetaControl && !isUserView;
  const metaControlFrameClassName = isMetaControl
    ? "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60"
    : undefined;
  const metaHeaderVisibilityClassName = isMetaHeaderOpen
    ? "opacity-100 pointer-events-auto"
    : "opacity-0 pointer-events-none";
  const metaHeaderRadiusClassName = positionAndSizeLocked
    ? "rounded-t-sm"
    : "rounded-t-xl";

  return (
    <CustomResizable
      sectionId={sectionId}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isActiveSection={isActiveSection}
      positionAndSizeLocked={positionAndSizeLocked}
      frameClassName={metaControlFrameClassName}
    >
      {isMetaControl ? (
        shouldRenderMetaHeader && (
          <>
            <div className="absolute left-0 top-1/2 z-30 -translate-y-1/2">
              <div className="flex h-12 w-10 -translate-x-full items-center justify-end">
                <button
                  type="button"
                  onClick={() => setIsMetaHeaderOpen((prev) => !prev)}
                  aria-label={
                    isMetaHeaderOpen
                      ? "Hide section header"
                      : "Show section header"
                  }
                  aria-pressed={isMetaHeaderOpen}
                  className={`nodrag flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-white shadow-md transition-opacity duration-150 hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 dark:focus-visible:ring-orange-500 ${isMetaHeaderOpen ? "ring-2 ring-orange-300/70 dark:ring-orange-500/60" : ""} opacity-0 pointer-events-none group-hover/card-section:opacity-100 group-hover/card-section:pointer-events-auto`}
                >
                  {isMetaHeaderOpen ? (
                    <TbChevronLeft className="h-4 w-4" />
                  ) : (
                    <TbChevronRight className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div
              className={`absolute left-0 right-0 top-0 z-20 transition-opacity duration-150 ${metaHeaderVisibilityClassName}`}
            >
              <div
                className={`border-b border-setta-200/80 bg-white/95 py-1 shadow-sm backdrop-blur-sm dark:border-setta-800/70 dark:bg-setta-950/90 ${metaHeaderRadiusClassName}`}
              >
                <SectionHeader
                  sectionId={sectionId}
                  isActiveSection={isActiveSection}
                  sectionTypeName={sectionTypeName}
                  isInOtherProjectConfigs={isInOtherProjectConfigs}
                  isUserView={isUserView}
                  isRoot={isRoot}
                />
              </div>
            </div>
          </>
        )
      ) : (
        <SectionHeader
          sectionId={sectionId}
          isActiveSection={isActiveSection}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isUserView={isUserView}
          isRoot={isRoot}
        />
      )}
      {isRoot && <Incrementer sectionId={sectionId} isRoot={isRoot} />}
      {!isMinimized && (
        <AreaSwitch
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          bgColor={bgColor}
        />
      )}
    </CustomResizable>
  );
}

function AreaSwitch({
  sectionId,
  sectionTypeName,
  bgColor,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
}) {
  switch (sectionTypeName) {
    case SectionTypeEnum.Callable:
      return <CallableArea sectionId={sectionId} bgColor={bgColor} />;
    case SectionTypeEnum.Dict:
      return <DictArea sectionId={sectionId} bgColor={bgColor} />;
    case SectionTypeEnum.Image:
      return <ImageArea sectionId={sectionId} />;
    case SectionTypeEnum.Chart:
      return <ChartArea sectionId={sectionId} />;
    case SectionTypeEnum.Draw:
      return <DrawArea sectionId={sectionId} />;
    case SectionTypeEnum.Social:
      return <SocialArea sectionId={sectionId} />;
    case SectionTypeEnum.TextBlock:
      return <TextBlock sectionId={sectionId} />;
    case SectionTypeEnum.MetaControl:
      return <MetaControlArea sectionId={sectionId} />;
    case SectionTypeEnum.GlobalVariables:
      return <GlobalVariablesArea sectionId={sectionId} bgColor={bgColor} />;
    case SectionTypeEnum.Code:
      return <CodeArea sectionId={sectionId} />;
    case SectionTypeEnum.GenPythonCode:
      return <GenPythonCodeArea sectionId={sectionId} />;
    case SectionTypeEnum.Terminal:
      return <TerminalArea sectionId={sectionId} />;
    case SectionTypeEnum.IFrame:
      return <IframeArea sectionId={sectionId} />;
    case SectionTypeEnum.Chat:
      return <ChatArea sectionId={sectionId} />;
    case SectionTypeEnum.Browser:
      return <BrowserArea sectionId={sectionId} />;
    case SectionTypeEnum.ListRoot:
    case SectionTypeEnum.Group:
      return null;
    default:
      return sectionTypeName satisfies never;
  }
}
