import { useSectionHasMultipleParamSweeps } from "hooks/useParamSweepInfo";
import { useSectionHasMultipleEVCols } from "hooks/useSectionInfo";
import { TbVersions } from "react-icons/tb";
import { Button } from "utils/atoms/buttons/Button";
import { CustomResizable } from "utils/Resizable/CustomResizable";
import {
  CODE,
  GLOBAL_PARAM_SWEEP,
  GLOBAL_VARIABLES,
  INFO,
  OUTPUT,
  PARAM_SWEEP,
  SECTION,
  SOCIAL,
  TERMINAL,
  VAR_CONTROL,
} from "z_utils/constants";
import { CodeArea } from "./CodeArea";
import "./dndline.css";
import { GlobalParamSweepArea } from "./GlobalParamSweepArea";
import { GlobalVariablesArea } from "./GlobalVariablesArea";
import { SectionHeader } from "./Header/SectionHeader";
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
}) {
  const isGlobalVariables = sectionTypeName === GLOBAL_VARIABLES;
  const isInfo = sectionTypeName === INFO;
  const hasEVVersions = useSectionHasMultipleEVCols(sectionId);
  const hasParamSweepVersions = useSectionHasMultipleParamSweeps(sectionId);
  const hasVersions =
    (sectionTypeName === PARAM_SWEEP && hasParamSweepVersions) || hasEVVersions;

  const getOutlineColor = () => {
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
      case VAR_CONTROL:
      case CODE:
        return "bg-white dark:bg-runcoder-900";
      case TERMINAL:
        return "bg-runcoder-950 overflow-clip";
      case GLOBAL_PARAM_SWEEP:
        return "@container/multipane";
      // case PARAM_SWEEP:
      //   return "bg-runcoder-50 dark:bg-runcoder-850";
      default:
        return "bg-runcoder-50 dark:bg-runcoder-875";
    }
  };

  const outlineColor = getOutlineColor();
  const bgColor = getBgColor();

  const borderClasses =
    "before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:border before:border-white dark:before:border-runcoder-700";

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
          <AreaSwitch sectionId={sectionId} sectionTypeName={sectionTypeName} />
          {hasVersions && (
            <Button
              grid={false}
              twClasses="card-configs-btn backdrop-blur-[2px] px-2 py-1 self-center text-runcoder-700 dark:text-runcoder-300 dark:bg-runcoder-900/40 hover:bg-white dark:hover:bg-runcoder-900 rounded-full gap-1 font-heading uppercase border-2 border-solid border-white dark:border-runcoder-800 text-xs bgruncoder-200/25 shadow-md hover:shadow-lg z-50"
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
    case SECTION:
      return <InputArea sectionId={sectionId} />;
    case OUTPUT:
      return <OutputArea sectionId={sectionId} />;
    case SOCIAL:
      return <SocialArea sectionId={sectionId} />;
    case INFO:
      return <InfoArea sectionId={sectionId} />;
    case GLOBAL_VARIABLES:
      return <GlobalVariablesArea sectionId={sectionId} />;
    case CODE:
    case VAR_CONTROL:
      return <CodeArea sectionId={sectionId} />;
    case PARAM_SWEEP:
      return <ParamSweepArea sectionId={sectionId} />;
    case TERMINAL:
      return <TerminalArea sectionId={sectionId} />;
    case GLOBAL_PARAM_SWEEP:
      return <GlobalParamSweepArea />;
    default:
      return null;
  }
}
