import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useActiveSection } from "models/activeSection";
import { UI_CONFIG_TAB, useUIEditor } from "models/uiEditor";
import React from "react";
import { setSectionUITypeConfig, setSectionUITypeId } from "thunks/uiTypes";
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

  return (
    <>
      {cameFromUIConfig && <button onClick={onGoBackClick}>Go back</button>}
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
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-xs uppercase text-gray-400 font-semibold">
          Card Types
        </h3>
        <SectionConfigTypeSelection
          onDropdownSelect={onSectionTypeChange}
          selectedId={currTypeId}
          sectionId={sectionId}
        />
      </div>
      <div>
        <h3 className="text-xs uppercase text-gray-400 font-semibold">
          Contents
        </h3>
        <SectionConfigComp
          sectionId={sectionId}
          onConfigChange={onConfigChange}
        />
      </div>
    </div>
  );
}
