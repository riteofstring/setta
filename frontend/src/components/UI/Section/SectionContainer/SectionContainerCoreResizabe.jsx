import C from "constants/constants.json";
import { useSectionHasMultipleParamSweeps } from "hooks/useParamSweepInfo";
import { TbVersions } from "react-icons/tb";
import { useSectionHasMultipleEVCols } from "state/sectionInfos/hooks";
import { Button } from "utils/atoms/buttons/Button";
import { CustomResizable } from "utils/Resizable/CustomResizable";
import { isRoot } from "z_utils/constants";
import { CodeArea } from "./CodeArea";
import "./dndline.css";
import { GlobalParamSweepArea } from "./GlobalParamSweepArea";
import { GlobalVariablesArea } from "./GlobalVariablesArea";
import { SectionHeader } from "./Header/SectionHeader";
import { Incrementer } from "./Incrementer/Incrementer";
import { InfoArea } from "./InfoArea";
import { InputArea } from "./InputArea";
import { VersionList } from "./Main/VersionList/VersionList";
import { OutputArea } from "./OutputArea";
import { ParamSweepArea } from "./ParamSweepArea";
import { SocialArea } from "./SocialArea";
import { TerminalArea } from "./TerminalArea";

export function SectionContainerCoreResizable({
  sectionId,
  isSeriesElement,
  sectionTypeName,
  isActiveSection,
  toggleDescVis,
  isWrongType,
  dbSourceIsAvailable,
}) {
  const isGlobalVariables = sectionTypeName === C.GLOBAL_VARIABLES;
  const isInfo = sectionTypeName === C.INFO;
  const hasEVVersions = useSectionHasMultipleEVCols(sectionId);
  const hasParamSweepVersions = useSectionHasMultipleParamSweeps(sectionId);
  const hasVersions =
    (sectionTypeName === C.PARAM_SWEEP && hasParamSweepVersions) ||
    hasEVVersions;

  const getOutlineColor = () => {
    if (!dbSourceIsAvailable) {
      return "outline-orange-600 dark:outline-orange-400";
    }
    if (isWrongType) {
      return "outline-red-600 dark:outline-red-400";
    }
    if (isActiveSection && isGlobalVariables) {
      return "outline-green-600 dark:outline-turquoise-400";
    }
    if (isActiveSection) {
      return "outline-blue-600 dark:outline-blue-700";
    }

    return "outline-transparent active:outline-cyan-300";
  };

  const getBgColor = () => {
    if (isGlobalVariables) {
      return "bg-white dark:bg-black";
    }
    switch (sectionTypeName) {
      case C.VAR_CONTROL:
      case C.CODE:
        return "bg-white dark:bg-setta-900";
      case C.TERMINAL:
        return "bg-setta-950 overflow-clip";
      case C.GLOBAL_PARAM_SWEEP:
        return "@container/multipane";
      // case PARAM_SWEEP:
      //   return "bg-setta-50 dark:bg-setta-850";
      default:
        return "bg-setta-50 dark:bg-setta-875";
    }
  };
  const _isRoot = isRoot(sectionTypeName);

  const outlineColor = getOutlineColor();
  const bgColor = getBgColor();

  const borderClasses =
    "before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:border before:border-white dark:before:border-setta-700";

  const inputClasses = `outline outline-4 ${outlineColor} [transition:_outline-color_200ms_ease] ${bgColor} card-grid h-full rounded-xl shadow-md  ${
    isActiveSection ? "z-[150]" : "z-10"
  } ${borderClasses}`;

  return (
    <>
      <CustomResizable
        sectionId={sectionId}
        inputClasses={inputClasses}
        as="section"
      >
        <>
          <SectionHeader
            sectionId={sectionId}
            isSeriesElement={isSeriesElement}
            isActiveSection={isActiveSection}
            isGlobalVariables={isGlobalVariables}
            isInfo={isInfo}
            sectionTypeName={sectionTypeName}
          />
          {_isRoot && <Incrementer sectionId={sectionId} isRoot={_isRoot} />}
          <AreaSwitch sectionId={sectionId} sectionTypeName={sectionTypeName} />
          {hasVersions && (
            <Button
              grid={false}
              twClasses="card-configs-btn backdrop-blur-[2px] px-2 py-1 self-center text-setta-700 dark:text-setta-300 dark:bg-setta-900/40 hover:bg-white dark:hover:bg-setta-900 rounded-full gap-1 font-heading uppercase border-2 border-solid border-white dark:border-setta-800 text-xs bgsetta-200/25 shadow-md hover:shadow-lg z-50"
              onClick={toggleDescVis}
            >
              <TbVersions className="z-[3] h-4 w-4" />
              Versions
            </Button>
          )}
        </>
      </CustomResizable>
      {hasVersions && (
        <VersionList sectionId={sectionId} sectionTypeName={sectionTypeName} />
      )}
    </>
  );
}

function AreaSwitch({ sectionId, sectionTypeName }) {
  switch (sectionTypeName) {
    case C.SECTION:
      return <InputArea sectionId={sectionId} />;
    case C.OUTPUT:
      return <OutputArea sectionId={sectionId} />;
    case C.SOCIAL:
      return <SocialArea sectionId={sectionId} />;
    case C.INFO:
      return <InfoArea sectionId={sectionId} />;
    case C.GLOBAL_VARIABLES:
      return <GlobalVariablesArea sectionId={sectionId} />;
    case C.CODE:
    case C.VAR_CONTROL:
      return <CodeArea sectionId={sectionId} />;
    case C.PARAM_SWEEP:
      return <ParamSweepArea sectionId={sectionId} />;
    case C.TERMINAL:
      return <TerminalArea sectionId={sectionId} />;
    case C.GLOBAL_PARAM_SWEEP:
      return <GlobalParamSweepArea />;
    default:
      return null;
  }
}
