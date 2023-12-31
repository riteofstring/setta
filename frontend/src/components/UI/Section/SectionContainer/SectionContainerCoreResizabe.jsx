import { useSectionInfos } from "models/info/sectionInfos";
import { useState } from "react";
import { BiInfoCircle } from "react-icons/bi";
import { Button } from "utils/atoms/buttons/Button";
import { CustomResizable } from "utils/Resizable/CustomResizable";
import { CodeArea } from "./CodeArea";
import "./dndline.css";
import { GlobalVariablesArea } from "./GlobalVariablesArea";
import { SectionHeader } from "./Header/SectionHeader";
import { InputArea } from "./InputArea";
import { SectionDescription } from "./Main/SectionDescription/SectionDescription";
import { OutputArea } from "./OutputArea";
import { ScriptArea } from "./ScriptArea";
import { SocialArea } from "./SocialArea";
import { VarControlArea } from "./VarControlArea";

export function SectionContainerCoreResizable({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  isRoot,
  isOutput,
  isSocial,
  isInfo,
  isGlobalVariables,
  isScript,
  isCode,
  isVarControl,
  hasNested,
  hasDescription,
  isActiveSection,
  toggleDescVis,
  isWrongType,
}) {
  const width = useSectionInfos((x) => x.x[sectionId].size.width);
  const [localWidth, setLocalWidth] = useState(width);

  // ${hasDescription && ""}

  const outlineColor = isWrongType
    ? "outline-red-600 dark:outline-red-400"
    : isActiveSection
    ? `${
        isGlobalVariables
          ? "outline-green-600 dark:outline-turquoise-800"
          : "outline-blue-600 dark:outline-blue-400"
      }`
    : "outline-transparent active:outline-cyan-300";

  const borderClasses =
    "before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:border before:border-white dark:before:border-runcoder-700";

  const inputClasses = `outline outline-4 ${outlineColor} [transition:_outline-color_200ms_ease] gap-2 ${
    isGlobalVariables
      ? "bg-white dark:bg-black"
      : "bg-runcoder-50 dark:bg-runcoder-800"
  }  pt-3 flex h-full flex-grow flex-col rounded-xl shadow-md  ${
    isActiveSection ? "z-[150]" : "z-10"
  } ${borderClasses}`;

  return (
    <>
      <CustomResizable
        sectionId={sectionId}
        setLocalWidth={setLocalWidth}
        inputClasses={inputClasses}
        as="section"
      >
        <SectionHeader
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          isSeriesElement={isSeriesElement}
          isRoot={isRoot}
          hasNested={hasNested}
          isActiveSection={isActiveSection}
          isGlobalVariables={isGlobalVariables}
        />
        <AreaSwitch
          sectionId={sectionId}
          isOutput={isOutput}
          isSocial={isSocial}
          isRoot={isRoot}
          isInfo={isInfo}
          isGlobalVariables={isGlobalVariables}
          isScript={isScript}
          isCode={isCode}
          isVarControl={isVarControl}
        />

        {!isInfo && hasDescription && (
          <Button
            grid={false}
            twClasses="absolute backdrop-blur-[2px] bottom-0 mb-2 px-2 py-1 self-center text-slate-500 dark:text-runcoder-300 dark:bg-runcoder-700/25 hover:bg-white dark:hover:bg-runcoder-900 rounded-full gap-1 font-heading uppercase border-2 border-solid border-white dark:border-runcoder-800 text-xs bg-slate-200/25 shadow-md hover:shadow-lg transition-colors"
            onClick={toggleDescVis}
          >
            <BiInfoCircle className="z-[3] h-4 w-4" />
            Info
          </Button>
        )}
      </CustomResizable>

      {!isInfo && (
        <SectionDescription sectionId={sectionId} width={localWidth} />
      )}
    </>
  );
}

function AreaSwitch({
  sectionId,
  isOutput,
  isSocial,
  isRoot,
  isInfo,
  isGlobalVariables,
  isScript,
  isCode,
  isVarControl,
}) {
  if (isOutput) {
    return <OutputArea sectionId={sectionId} />;
  }
  if (isSocial) {
    return <SocialArea sectionId={sectionId} />;
  }
  if (isInfo) {
    return <SectionDescription sectionId={sectionId} card={true} />;
  }
  if (isGlobalVariables) {
    return <GlobalVariablesArea sectionId={sectionId} />;
  }
  if (isScript) {
    return <ScriptArea sectionId={sectionId} />;
  }
  if (isCode) {
    return <CodeArea sectionId={sectionId} />;
  }
  if (isVarControl) {
    return <VarControlArea sectionId={sectionId} />;
  }
  if (!isRoot) {
    return (
      <InputArea sectionId={sectionId} isGlobalVariables={isGlobalVariables} />
    );
  }
}
