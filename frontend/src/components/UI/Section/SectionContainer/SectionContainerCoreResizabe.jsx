import { BiInfoCircle } from "react-icons/bi";
import { Button } from "utils/atoms/buttons/Button";
import { CustomResizable } from "utils/Resizable/CustomResizable";
import {
  CODE,
  GLOBAL_VARIABLES,
  INFO,
  OUTPUT,
  SCRIPT,
  SECTION,
  SOCIAL,
  VAR_CONTROL,
} from "z_utils/constants";
import { CodeArea } from "./CodeArea";
import "./dndline.css";
import { GlobalVariablesArea } from "./GlobalVariablesArea";
import { SectionHeader } from "./Header/SectionHeader";
import { InputArea } from "./InputArea";
import { SectionDescription } from "./Main/SectionDescription/SectionDescription";
import { VersionList } from "./Main/VersionList/VersionList";
import { OutputArea } from "./OutputArea";
import { ScriptArea } from "./ScriptArea";
import { SocialArea } from "./SocialArea";
import { VarControlArea } from "./VarControlArea";

export function SectionContainerCoreResizable({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  sectionTypeName,
  hasNested,
  hasDescription,
  isActiveSection,
  toggleDescVis,
  isWrongType,
}) {
  const isGlobalVariables = sectionTypeName === GLOBAL_VARIABLES;
  const isInfo = sectionTypeName === INFO;

  const getOutlineColor = () => {
    if (isWrongType) {
      return "outline-red-600 dark:outline-red-400";
    }
    if (isActiveSection && isGlobalVariables) {
      return "outline-green-600 dark:outline-turquoise-800";
    }
    if (isActiveSection) {
      return "outline-blue-600 dark:outline-blue-400";
    }

    return "outline-transparent active:outline-cyan-300";
  };

  const outlineColor = getOutlineColor();

  // const outlineColor = isWrongType
  //   ? "outline-red-600 dark:outline-red-400"
  //   : isActiveSection
  //   ? `${
  //       isGlobalVariables
  //         ? "outline-green-600 dark:outline-turquoise-800"
  //         : "outline-blue-600 dark:outline-blue-400"
  //     }`
  //   : "outline-transparent active:outline-cyan-300";

  const borderClasses =
    "before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:border before:border-white dark:before:border-runcoder-700";

  const inputClasses = `outline outline-4 ${outlineColor} [transition:_outline-color_200ms_ease] ${
    isGlobalVariables
      ? "bg-white dark:bg-black"
      : sectionTypeName === VAR_CONTROL
      ? "bg-white dark:bg-runcoder-900"
      : "bg-runcoder-50 dark:bg-runcoder-800"
  } card-grid h-full rounded-xl shadow-md  ${
    isActiveSection ? "z-[150]" : "z-10"
  } ${borderClasses}`;

  return (
    <>
      <CustomResizable
        sectionId={sectionId}
        inputClasses={inputClasses}
        as="section"
      >
        <SectionHeader
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          isSeriesElement={isSeriesElement}
          hasNested={hasNested}
          isActiveSection={isActiveSection}
          isGlobalVariables={isGlobalVariables}
          isInfo={isInfo}
          sectionTypeName={sectionTypeName}
        />
        <AreaSwitch sectionId={sectionId} sectionTypeName={sectionTypeName} />
        <Button
          grid={false}
          twClasses="card-configs-btn backdrop-blur-[2px] px-2 py-1 self-center text-runcoder-500 dark:text-runcoder-300 dark:bg-runcoder-700/25 hover:bg-white dark:hover:bg-runcoder-900 rounded-full gap-1 font-heading uppercase border-2 border-solid border-white dark:border-runcoder-800 text-xs bgruncoder-200/25 shadow-md hover:shadow-lg z-50"
          onClick={toggleDescVis}
        >
          <BiInfoCircle className="z-[3] h-4 w-4" />
          Versions
        </Button>

        {/* {!isInfo && hasDescription && (
          <Button
            grid={false}
            twClasses="card-configs-btn backdrop-blur-[2px] px-2 py-1 self-center text-runcoder-500 dark:text-runcoder-300 dark:bg-runcoder-700/25 hover:bg-white dark:hover:bg-runcoder-900 rounded-full gap-1 font-heading uppercase border-2 border-solid border-white dark:border-runcoder-800 text-xs bgruncoder-200/25 shadow-md hover:shadow-lg"
            onClick={toggleDescVis}
          >
            <BiInfoCircle className="z-[3] h-4 w-4" />
            Versions
          </Button>
        )} */}
      </CustomResizable>
      <VersionList sectionId={sectionId} />

      {/* {!isInfo && <SectionDescription sectionId={sectionId} />} */}
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
      return <SectionDescription sectionId={sectionId} card={true} />;
    case GLOBAL_VARIABLES:
      return <GlobalVariablesArea sectionId={sectionId} />;
    case SCRIPT:
      return <ScriptArea sectionId={sectionId} />;
    case CODE:
      return <CodeArea sectionId={sectionId} />;
    case VAR_CONTROL:
      return <VarControlArea sectionId={sectionId} />;
    default:
      return null;
  }
}
