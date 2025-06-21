import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import _ from "lodash";
import { getIsUserView, getEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { SectionHeader } from "../Header/SectionHeader";
import { BrowserArea } from "../Layouts/BrowserArea";
import { ChartArea } from "../Layouts/ChartArea/ChartArea";
import { ChatArea } from "../Layouts/ChatArea";
import { CodeArea, GenPythonCodeArea } from "../Layouts/CodeArea";
import { DictArea } from "../Layouts/DictArea";
import { DrawArea } from "../Layouts/DrawArea/DrawArea";
import { GlobalVariablesArea } from "../Layouts/GlobalVariablesArea";
import { IframeArea } from "../Layouts/IframeArea";
import { ImageArea } from "../Layouts/ImageArea";
import { CallableArea } from "../Layouts/InputArea";
import { SocialArea } from "../Layouts/SocialArea";
import { TerminalArea } from "../Layouts/TerminalArea";
import { TextBlock } from "../Layouts/TextBlock";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";
import { getBgColor } from "./utils";

export function SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  isActiveSection,
  isInOtherProjectConfigs,
  viewingEditingMode,
  positionAndSizeLocked,
}) {
  const { isMinimized, isYouTube } = useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    return {
      isMinimized: impl.isMinimized,
      isYouTube: false,
      // isYouTube: getIsYouTubeSection(sectionId, x),
    };
  }, _.isEqual);

  const isRoot = getIsRoot(sectionTypeName);
  const bgColor = getBgColor(sectionTypeName);
  const isUserView = getIsUserView(viewingEditingMode);

  return (
    <CustomResizable
      sectionId={sectionId}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isActiveSection={isActiveSection}
      positionAndSizeLocked={positionAndSizeLocked}
    >
      <SectionHeader
        sectionId={sectionId}
        isActiveSection={isActiveSection}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        viewingEditingMode={viewingEditingMode}
        isUserView={isUserView}
        isRoot={isRoot}
      />
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

function AreaSwitch({ sectionId, sectionTypeName, bgColor }) {
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
    default:
      return null;
  }
}
