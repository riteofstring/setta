import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import _ from "lodash";
import {
  getCurrEffectiveSectionImpl,
  isBaseCodeSectionType,
} from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import {
  isBaseParentSectionImpl,
  SectionTypeEnum,
  type SectionType,
} from "utils/generatedTypes";
import { SectionHeader } from "../Header/SectionHeader";
import { BrowserArea } from "../Layouts/BrowserArea";
import { CallableArea } from "../Layouts/CallableArea";
import { ChartArea } from "../Layouts/ChartArea/ChartArea";
import { ChatArea } from "../Layouts/ChatArea";
import {
  CodeArea,
  GenPythonCodeArea,
  GenPythonMetadataArea,
} from "../Layouts/CodeArea";
import { DictArea } from "../Layouts/DictArea";
import { DrawArea } from "../Layouts/DrawArea/DrawArea";
import { GlobalVariablesArea } from "../Layouts/GlobalVariablesArea";
import { IframeArea } from "../Layouts/IframeArea";
import { ImageArea } from "../Layouts/ImageArea";
import { MetaControlArea } from "../Layouts/MetaControlArea";
import { PromptArea } from "../Layouts/PromptArea";
import { SocialArea } from "../Layouts/SocialArea";
import { TerminalArea } from "../Layouts/TerminalArea";
import { TextBlock } from "../Layouts/TextBlock";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";
import { MetaControlMenuButton } from "./MetaControlMenuButton";
import { TextBlockMetaControlMenuButton } from "./TextBlockMetaControlMenuButton";
import { getBgColor } from "./utils";

type SectionContainerCoreResizableProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isActiveSection: boolean;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  hideHeader?: boolean;
};

export function SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  isActiveSection,
  isInOtherProjectConfigs,
  isUserView,
  positionAndSizeLocked,
  hideHeader = false,
}: SectionContainerCoreResizableProps) {
  const {
    isMinimized,
    isYouTube,
    textBlockMetaControlStyle,
    hasEmbeddedTerminal,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const children = isBaseParentSectionImpl(impl) ? impl.children : [];
    let hasEmbeddedTerminal = false;
    if (isBaseCodeSectionType(impl.type)) {
      const candidateId =
        children.length > 0 ? children[0] : impl.attachedTerminalSectionId;
      if (candidateId) {
        const childImpl = getCurrEffectiveSectionImpl(x, candidateId);
        hasEmbeddedTerminal =
          childImpl?.type === SectionTypeEnum.Terminal && children.length < 2;
      }
    }
    return {
      isMinimized: impl.isMinimized,
      isYouTube: false,
      // isYouTube: getIsYouTubeSection(sectionId, x),
      textBlockMetaControlStyle:
        impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
      hasEmbeddedTerminal,
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

  return (
    <CustomResizable
      sectionId={sectionId}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isActiveSection={isActiveSection}
      isMetaControl={useMetaControlStyle}
      positionAndSizeLocked={positionAndSizeLocked}
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
          <div className="absolute left-0 top-1/2 z-30 -translate-x-full -translate-y-1/2">
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
          <div className="absolute left-0 top-1/2 z-30 -translate-x-full -translate-y-1/2">
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
      ) : hideHeader ? null : (
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
      <AreaSwitch
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        bgColor={bgColor}
        isMinimized={isMinimized}
      />
    </CustomResizable>
  );
}

function AreaSwitch({
  sectionId,
  sectionTypeName,
  bgColor,
  isMinimized,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
  isMinimized: boolean;
}) {
  if (isMinimized && sectionTypeName !== SectionTypeEnum.Callable) {
    return null;
  }
  switch (sectionTypeName) {
    case SectionTypeEnum.Callable:
      return (
        <CallableArea
          sectionId={sectionId}
          bgColor={bgColor}
          isMinimized={isMinimized}
        />
      );
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
    case SectionTypeEnum.Prompt:
      return <PromptArea sectionId={sectionId} />;
    case SectionTypeEnum.MetaControl:
      return <MetaControlArea sectionId={sectionId} />;
    case SectionTypeEnum.GlobalVariables:
      return <GlobalVariablesArea sectionId={sectionId} bgColor={bgColor} />;
    case SectionTypeEnum.Code:
      return <CodeArea sectionId={sectionId} />;
    case SectionTypeEnum.GenPythonCode:
      return <GenPythonCodeArea sectionId={sectionId} />;
    case SectionTypeEnum.GenPythonMetadata:
      return <GenPythonMetadataArea sectionId={sectionId} />;
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
