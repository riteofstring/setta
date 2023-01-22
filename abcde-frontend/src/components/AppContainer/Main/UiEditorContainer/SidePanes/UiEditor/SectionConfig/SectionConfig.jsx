import { OUTPUT } from "abcde-utils/src/constants";
import { useGetSectionType } from "hooks/useSectionType";
import { useUIEditor } from "models/uiEditor";
import React from "react";
import { IoArrowBack } from "react-icons/io5";
import { goToParamConfigTab } from "thunks/switchTabs";
import { setSectionUITypeConfig } from "thunks/uiTypes";
import { Button } from "utils/atoms/buttons/Button";
import { OutputSectionConfigComp } from "./OutputSectionConfigComp";
import SectionConfigComp from "./SectionConfigComp";
import SectionConfigTypeSelection from "./SectionConfigTypeSelection";

export default React.memo(SectionConfig);

function SectionConfig({ sectionId }) {
  return (
    <>
      <GoBackButton sectionId={sectionId} />
      <SectionConfigCore sectionId={sectionId} />
    </>
  );
}

function SectionConfigCore({ sectionId }) {
  const sectionType = useGetSectionType(sectionId, "type");

  const onConfigChange = ({ newValueFn }) => {
    setSectionUITypeConfig({
      sectionId,
      configProps: { configName: "collections", newValueFn },
    });
  };

  return (
    <div className="flex flex-col flex-grow gap-1">
      <h3 className="text-xs uppercase text-gray-400 font-semibold mt-2">
        Card Types
      </h3>
      <SectionConfigTypeSelection sectionId={sectionId} />

      <h3 className="text-xs uppercase text-gray-400 font-semibold mt-4">
        Contents
      </h3>
      {sectionType === OUTPUT ? (
        <OutputSectionConfigComp sectionId={sectionId} />
      ) : (
        <SectionConfigComp
          sectionId={sectionId}
          onConfigChange={onConfigChange}
        />
      )}
    </div>
  );
}

function GoBackButton({ sectionId }) {
  const cameFromUIConfig = useUIEditor((x) => x.cameFromUIConfig);
  const onGoBackClick = () => goToParamConfigTab({ sectionId });

  const goBackBtnStyles =
    "mt-2 border border-solid border-gray-300 font-bold text-sm self-stretch justify-center text-gray-800 hover:bg-gray-200 hover:text-gray-900 py-1 px-2 rounded-md gap-1 select-none my-2 self-start";

  return cameFromUIConfig ? (
    <Button twClasses={goBackBtnStyles} onClick={onGoBackClick}>
      <IoArrowBack className="w-5 h-5" /> Go back
    </Button>
  ) : null;
}
