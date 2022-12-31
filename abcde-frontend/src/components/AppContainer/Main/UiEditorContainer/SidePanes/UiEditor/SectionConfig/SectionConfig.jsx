import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useActiveSection } from "models/activeSection";
import { UI_CONFIG_TAB, useUIEditor } from "models/uiEditor";
import React from "react";
import { IoArrowBack } from "react-icons/io5";
import { setSectionUITypeConfig, setSectionUITypeId } from "thunks/uiTypes";
import { Button } from "utils/atoms/buttons/Button";
import SectionConfigComp from "./SectionConfigComp";
import SectionConfigTypeSelection from "./SectionConfigTypeSelection";

export default React.memo(SectionConfig);

function SectionConfig() {
  const sectionId = useActiveSection((x) => x.id);
  const setActiveSection = useActiveSection((x) => x.setId);
  const cameFromUIConfig = useUIEditor((x) => x.cameFromUIConfig);
  const setCameFromUIConfig = useUIEditor((x) => x.setCameFromUIConfig);
  const setTab = useUIEditor((x) => x.setTab);
  const [parentId] = useGetSectionInfo(sectionId, ["parentId"]);
  const [currTypeId] = useGetSectionConfig(sectionId, ["uiTypeId"]);

  const onGoBackClick = () => {
    setActiveSection(parentId);
    setCameFromUIConfig(false);
    setTab(UI_CONFIG_TAB);
  };

  const onSectionTypeChange = (e) => {
    if (e && e !== currTypeId) {
      setSectionUITypeId({ uiTypeId: e, sectionId });
    }
  };

  const onConfigChange = ({ newValueFn }) => {
    setSectionUITypeConfig({
      sectionId,
      configProps: { configName: "collections", newValueFn },
    });
  };

  const goBackBtnStyles =
    "mt-2 border border-solid border-gray-300 font-bold text-sm self-stretch justify-center text-gray-800 hover:bg-gray-200 hover:text-gray-900 py-1 px-2 rounded-md gap-1 select-none my-2 self-start";

  return (
    <>
      {cameFromUIConfig && (
        <Button twClasses={goBackBtnStyles} onClick={onGoBackClick}>
          <IoArrowBack className="w-5 h-5" /> Go back
        </Button>
      )}
      <SectionConfigCore
        onSectionTypeChange={onSectionTypeChange}
        currTypeId={currTypeId}
        sectionId={sectionId}
        onConfigChange={onConfigChange}
      />
    </>
  );
}

function SectionConfigCore({
  onSectionTypeChange,
  currTypeId,
  sectionId,
  onConfigChange,
}) {
  return (
    <div className="flex flex-col flex-grow gap-1">
      <h3 className="text-xs uppercase text-gray-400 font-semibold mt-2">
        Card Types
      </h3>
      <SectionConfigTypeSelection
        onDropdownSelect={onSectionTypeChange}
        selectedId={currTypeId}
        sectionId={sectionId}
      />

      <h3 className="text-xs uppercase text-gray-400 font-semibold mt-4">
        Contents
      </h3>
      <SectionConfigComp
        sectionId={sectionId}
        onConfigChange={onConfigChange}
      />
    </div>
  );
}
