import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import _ from "lodash";
import { getIsUserView } from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import { getIsYouTubeSection } from "state/hooks/social";
import { C } from "utils/c";
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
    case C.SECTION:
      return (
        <InputArea
          sectionId={sectionId}
          bgColor={bgColor}
          isUserView={isUserView}
        />
      );
    case C.IMAGE:
      return <ImageArea sectionId={sectionId} />;
    case C.CHART:
      return <ChartArea sectionId={sectionId} />;
    case C.DRAW:
      return <DrawArea sectionId={sectionId} />;
    case C.SOCIAL:
      return <SocialArea sectionId={sectionId} />;
    case C.TEXT_BLOCK:
      return <TextBlock sectionId={sectionId} />;
    case C.GLOBAL_VARIABLES:
      return (
        <GlobalVariablesArea
          sectionId={sectionId}
          bgColor={bgColor}
          isUserView={isUserView}
        />
      );
    case C.CODE:
      return <CodeArea sectionId={sectionId} />;
    case C.GEN_PYTHON_CODE:
      return <GenPythonCodeArea sectionId={sectionId} />;
    case C.TERMINAL:
      return <TerminalArea sectionId={sectionId} />;
    case C.IFRAME:
      return <IframeArea sectionId={sectionId} />;
    case C.CHAT:
      return <ChatArea sectionId={sectionId} />;
    case C.BROWSER:
      return <BrowserArea sectionId={sectionId} />;
    default:
      return null;
  }
}
