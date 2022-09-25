import { Button } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useGetSectionType } from "hooks/useSectionType";
import { useSetUIType } from "hooks/useUIType";
import React from "react";

import SectionConfigComp from "./SectionConfigComp";
import SectionConfigTypeSelection from "./SectionConfigTypeSelection";

export default React.memo(SectionConfigFunc);

function SectionConfigFunc() {
  const sectionId = useStoreState((x) => x.master.activeSection);
  const setActiveSection = useStoreActions((x) => x.master.setActiveSection);
  const cameFromUIConfig = useStoreState((x) => x.uiEditor.cameFromUIConfig);
  const setCameFromUIConfig = useStoreActions(
    (x) => x.uiEditor.setCameFromUIConfig
  );
  const setTabIndex = useStoreActions((x) => x.uiEditor.setTabIndex);

  const {
    name: sectionName,
    parentId,
    paramInfoId,
  } = useGetSectionInfo(sectionId);

  const currUIType = useGetSectionType(sectionId);
  const currTypeId = currUIType.id;

  const [setUITypeId, setUITypeConfig] = useSetUIType({
    sectionId: parentId,
    paramInfoId,
    defaultName: sectionName,
    childId: sectionId,
    currUIType,
    settingSectionConfig: true,
  });

  const onGoBackClick = () => {
    setActiveSection(parentId);
    setCameFromUIConfig(false);
    setTabIndex(1);
  };

  const onSectionTypeChange = (e) => {
    if (e && e !== currTypeId) {
      setUITypeId(e);
    }
  };

  const onConfigChange = (newValueFn) => {
    setUITypeConfig({ configName: "collections", newValueFn });
  };

  return (
    <>
      {cameFromUIConfig && <Button onClick={onGoBackClick}>Go back</Button>}
      <SectionConfigCore
        onSectionTypeChange={onSectionTypeChange}
        currTypeId={currTypeId}
        sectionId={sectionId}
        savedConfig={currUIType.config}
        onConfigChange={onConfigChange}
      />
    </>
  );
}

function SectionConfigCore({
  onSectionTypeChange,
  currTypeId,
  sectionId,
  savedConfig,
  onConfigChange,
}) {
  return (
    <>
      <SectionConfigTypeSelection
        onDropdownSelect={onSectionTypeChange}
        selectedId={currTypeId}
        sectionId={sectionId}
        simpleSearch={true}
      />
      <SectionConfigComp savedConfig={savedConfig} onChange={onConfigChange} />
    </>
  );
}
