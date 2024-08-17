import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import C from "constants/constants.json";
import { useGetSectionInfo } from "state/hooks/sections";
import { isRoot } from "utils/sectionTypeHelpers";
import { SectionHeader } from "../Header/SectionHeader";
import { CodeArea } from "../Layouts/CodeArea";
import { GlobalParamSweepArea } from "../Layouts/GlobalParamSweepArea";
import { GlobalVariablesArea } from "../Layouts/GlobalVariablesArea";
import { InfoArea } from "../Layouts/InfoArea";
import { InputArea } from "../Layouts/InputArea";
import { OutputArea } from "../Layouts/OutputArea";
import { ParamSweepArea } from "../Layouts/ParamSweepArea";
import { SocialArea } from "../Layouts/SocialArea";
import { MaybeTerminalArea } from "../Layouts/TerminalArea";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";

export function SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  isActiveSection,
  isWrongType,
  dbSourceIsAvailable,
}) {
  const isGlobalVariables = sectionTypeName === C.GLOBAL_VARIABLES;
  const isInfo = sectionTypeName === C.INFO;
  const isInOtherProjectConfigs = useGetSectionInfo(
    sectionId,
    "isInOtherProjectConfigs",
  );

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
    if (isInOtherProjectConfigs) {
      return "outline-purple-600 dark:outline-purple-700";
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
        return "bg-setta-50 dark:bg-setta-860";
    }
  };
  const _isRoot = isRoot(sectionTypeName);

  const outlineColor = getOutlineColor();
  const bgColor = getBgColor();

  const borderClasses =
    "before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:border before:border-white dark:before:border-setta-700";

  const inputClasses = `outline outline-4 ${outlineColor} [transition:_outline-color_200ms_ease] ${bgColor} section-grid h-full rounded-xl shadow-md  ${
    isActiveSection ? "z-[150]" : "z-10"
  } ${borderClasses}`;

  return (
    <CustomResizable
      sectionId={sectionId}
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
        />
        {_isRoot && <Incrementer sectionId={sectionId} isRoot={_isRoot} />}
        <AreaSwitch sectionId={sectionId} sectionTypeName={sectionTypeName} />
      </>
    </CustomResizable>
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
      return <MaybeTerminalArea sectionId={sectionId} />;
    case C.GLOBAL_PARAM_SWEEP:
      return <GlobalParamSweepArea />;
    default:
      return null;
  }
}
