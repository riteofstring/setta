import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import _ from "lodash";
import { getIsUserView } from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import { getIsYouTubeSection } from "state/hooks/social";
import { UITypeNameEnum } from "utils/generatedTypes";
import { SectionHeader } from "../Header/SectionHeader";
import { BrowserArea } from "../Layouts/BrowserArea";
import { ChartArea } from "../Layouts/ChartArea/ChartArea";
import { ChatArea } from "../Layouts/ChatArea";
import { CodeArea, GenPythonCodeArea } from "../Layouts/CodeArea";
import { DrawArea } from "../Layouts/DrawArea/DrawArea";
import { GlobalVariablesArea } from "../Layouts/GlobalVariablesArea";
import { IframeArea } from "../Layouts/IframeArea";
import { ImageArea } from "../Layouts/ImageArea";
import { InputArea } from "../Layouts/InputArea";
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
    return {
      isMinimized: x.sections[sectionId].isMinimized,
      isYouTube: getIsYouTubeSection(sectionId, x),
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
          isUserView={isUserView}
        />
      )}
    </CustomResizable>
  );
}

function AreaSwitch({ sectionId, sectionTypeName, bgColor, isUserView }) {
  switch (sectionTypeName) {
    case UITypeNameEnum.SECTION:
      return (
        <InputArea
          sectionId={sectionId}
          bgColor={bgColor}
          isUserView={isUserView}
        />
      );
    case UITypeNameEnum.IMAGE:
      return <ImageArea sectionId={sectionId} />;
    case UITypeNameEnum.CHART:
      return <ChartArea sectionId={sectionId} />;
    case UITypeNameEnum.DRAW:
      return <DrawArea sectionId={sectionId} />;
    case UITypeNameEnum.SOCIAL:
      return <SocialArea sectionId={sectionId} />;
    case UITypeNameEnum.TEXT_BLOCK:
      return <TextBlock sectionId={sectionId} />;
    case UITypeNameEnum.GLOBAL_VARIABLES:
      return (
        <GlobalVariablesArea
          sectionId={sectionId}
          bgColor={bgColor}
          isUserView={isUserView}
        />
      );
    case UITypeNameEnum.CODE:
      return <CodeArea sectionId={sectionId} />;
    case UITypeNameEnum.GEN_PYTHON_CODE:
      return <GenPythonCodeArea sectionId={sectionId} />;
    case UITypeNameEnum.TERMINAL:
      return <TerminalArea sectionId={sectionId} />;
    case UITypeNameEnum.IFRAME:
      return <IframeArea sectionId={sectionId} />;
    case UITypeNameEnum.CHAT:
      return <ChatArea sectionId={sectionId} />;
    case UITypeNameEnum.BROWSER:
      return <BrowserArea sectionId={sectionId} />;
    default:
      return null;
  }
}
