import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import C from "constants/constants.json";
import { useParamShortcuts, useSectionInfos } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useGetSectionInfo } from "state/hooks/sections";
import { isRoot } from "utils/sectionTypeHelpers";
import { SectionHeader } from "../Header/SectionHeader";
import { ArtifactArea } from "../Layouts/ArtifactArea";
import { CodeArea } from "../Layouts/CodeArea";
import { DrawOnImage } from "../Layouts/DrawArea";
import { GlobalParamSweepArea } from "../Layouts/GlobalParamSweepArea";
import { GlobalVariablesArea } from "../Layouts/GlobalVariablesArea";
import { InfoArea } from "../Layouts/InfoArea";
import { InputArea } from "../Layouts/InputArea";
import { ParamSweepArea } from "../Layouts/ParamSweepArea";
import { ReferenceArea } from "../Layouts/ReferenceArea";
import { SocialArea } from "../Layouts/SocialArea";
import { MaybeTerminalArea } from "../Layouts/TerminalArea";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";
import { getOutlineColor } from "./utils";

export function SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  isActiveSection,
  isWrongType,
}) {
  const isGlobalVariables = sectionTypeName === C.GLOBAL_VARIABLES;
  const isInfo = sectionTypeName === C.INFO;
  const isInOtherProjectConfigs = useGetSectionInfo(
    sectionId,
    "isInOtherProjectConfigs",
  );
  const isMinimized = useSectionInfos((x) => x.x[sectionId].isMinimized);
  const disablePointerEvents = useShouldDisablePointerEvents();
  const isSelectingParams = useParamShortcuts((x) => x.isSelectingParams);

  const pointerSelectCSS = disablePointerEvents
    ? "pointer-events-none select-none"
    : "";

  const getBgColor = () => {
    if (isGlobalVariables) {
      return "bg-white dark:bg-black";
    }
    switch (sectionTypeName) {
      case C.CODE:
        return "bg-white dark:bg-setta-900";
      case C.TERMINAL:
        return "bg-setta-950 overflow-clip";
      case C.GLOBAL_PARAM_SWEEP:
        return "@container/multipane";
      // case PARAM_SWEEP:
      //   return "bg-setta-50 dark:bg-setta-850";
      default:
        return "bg-setta-50 dark:bg-setta-860";
    }
  };
  const _isRoot = isRoot(sectionTypeName);

  const outlineColor = getOutlineColor({
    isWrongType,
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
    outlineOnMouseDown: !isSelectingParams,
  });
  const bgColor = getBgColor();

  const borderClasses =
    "before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:border before:border-white dark:before:border-setta-700";

  const inputClasses = `${pointerSelectCSS} outline outline-4 ${outlineColor} [transition:_outline-color_200ms_ease] ${bgColor} section-grid-cols section-grid-rows section-grid-areas grid h-full rounded-xl shadow-md  ${
    isActiveSection ? "z-[150]" : "z-10"
  } ${borderClasses}`;

  return (
    <CustomResizable
      sectionId={sectionId}
      disablePointerEvents={disablePointerEvents}
      inputClasses={inputClasses}
      as="section"
    >
      <>
        <SectionHeader
          sectionId={sectionId}
          isActiveSection={isActiveSection}
          isGlobalVariables={isGlobalVariables}
          isInfo={isInfo}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
        />
        {_isRoot && <Incrementer sectionId={sectionId} isRoot={_isRoot} />}
        {!isMinimized && (
          <AreaSwitch
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            bgColor={bgColor}
          />
        )}
      </>
    </CustomResizable>
  );
}

function AreaSwitch({ sectionId, sectionTypeName, bgColor }) {
  switch (sectionTypeName) {
    case C.SECTION:
      return <InputArea sectionId={sectionId} bgColor={bgColor} />;
    case C.REFERENCE_SECTION:
      return <ReferenceArea sectionId={sectionId} />;
    case C.ARTIFACT:
      return <ArtifactArea sectionId={sectionId} />;
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
      return <MaybeTerminalArea sectionId={sectionId} />;
    case C.GLOBAL_PARAM_SWEEP:
      return <GlobalParamSweepArea sectionId={sectionId} />;
    default:
      return null;
  }
}
