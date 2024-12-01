import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import C from "constants/constants.json";
import _ from "lodash";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useSectionInfos } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { getIsYouTubeSection } from "state/hooks/social";
import { SectionHeader } from "../Header/SectionHeader";
import { CodeArea } from "../Layouts/CodeArea";
import { DrawOnImage } from "../Layouts/DrawArea";
import { GlobalParamSweepArea } from "../Layouts/GlobalParamSweepArea";
import { GlobalVariablesArea } from "../Layouts/GlobalVariablesArea";
import { ImageArea } from "../Layouts/ImageArea";
import { InfoArea } from "../Layouts/InfoArea";
import { InputArea } from "../Layouts/InputArea";
import { LinePlotArea } from "../Layouts/LinePlotArea";
import { ParamSweepArea } from "../Layouts/ParamSweepArea";
import { SocialArea } from "../Layouts/SocialArea";
import { TerminalArea } from "../Layouts/TerminalArea";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";
import { getBgColor } from "./utils";

export function SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  isActiveSection,
  isInOtherProjectConfigs,
}) {
  console.log("SectionContainerCoreResizable");

  const { isMinimized, isYouTube } = useSectionInfos((x) => {
    return {
      isMinimized: x.x[sectionId].isMinimized,
      isYouTube: getIsYouTubeSection(sectionId, x),
    };
  }, _.isEqual);

  const disablePointerEvents = useShouldDisablePointerEvents();

  const isRoot = getIsRoot(sectionTypeName);
  const bgColor = getBgColor(sectionTypeName);

  const inputClasses = `${
    disablePointerEvents ? "pointer-events-none select-none" : ""
  } ${bgColor} section-grid-cols section-grid-rows section-grid-areas grid h-full rounded-xl shadow-md  before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:border before:border-white dark:before:border-setta-700 ${isYouTube ? "overflow-clip" : ""} ${
    isActiveSection ? "z-[150]" : "z-10"
  }`;

  return (
    <CustomResizable
      sectionId={sectionId}
      disablePointerEvents={disablePointerEvents}
      inputClasses={inputClasses}
      // as="section"
    >
      <SectionHeader
        sectionId={sectionId}
        isActiveSection={isActiveSection}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
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
    case C.SECTION:
      return <InputArea sectionId={sectionId} bgColor={bgColor} />;
    case C.IMAGE:
      return <ImageArea sectionId={sectionId} />;
    case C.LINE_PLOT:
      return <LinePlotArea sectionId={sectionId} />;
    case C.DRAW:
      return <DrawOnImage sectionId={sectionId} />;
    case C.SOCIAL:
      return <SocialArea sectionId={sectionId} />;
    case C.INFO:
      return <InfoArea sectionId={sectionId} />;
    case C.GLOBAL_VARIABLES:
      return <GlobalVariablesArea sectionId={sectionId} bgColor={bgColor} />;
    case C.CODE:
    case C.INTERACTIVE_CODE:
      return <CodeArea sectionId={sectionId} />;
    case C.PARAM_SWEEP:
      return <ParamSweepArea sectionId={sectionId} />;
    case C.TERMINAL:
      return <TerminalArea sectionId={sectionId} />;
    case C.GLOBAL_PARAM_SWEEP:
      return <GlobalParamSweepArea sectionId={sectionId} />;
    default:
      return null;
  }
}
