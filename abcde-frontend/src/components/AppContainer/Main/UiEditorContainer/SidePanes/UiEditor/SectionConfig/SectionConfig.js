import { Button } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useGetSectionType } from "hooks/useSectionType";
import { useSetSectionUIType } from "hooks/useUIType";

import SectionConfigComp from "./SectionConfigComp";
import SectionConfigTypeSelection from "./SectionConfigTypeSelection";

export default function SectionConfigFunc() {
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

  const [setUITypeId, setUITypeConfig] = useSetSectionUIType(
    sectionId,
    sectionName,
    parentId,
    paramInfoId,
    currUIType
  );

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

  const onConfigChange = (configName, newValueFn) => {
    setUITypeConfig({ configName, newValueFn });
  };

  return (
    <>
      {cameFromUIConfig && <Button onClick={onGoBackClick}>Go back</Button>}
      <SectionConfigCore
        onSectionTypeChange={onSectionTypeChange}
        currTypeId={currTypeId}
        savedConfig={currUIType.config}
        onConfigChange={onConfigChange}
      />
    </>
  );
}

export function SectionConfigCore({
  onSectionTypeChange,
  currTypeId,
  savedConfig,
  onConfigChange,
}) {
  return (
    <>
      <SectionConfigTypeSelection
        onDropdownSelect={onSectionTypeChange}
        selectedId={currTypeId}
      />
      <SectionConfigComp savedConfig={savedConfig} onChange={onConfigChange} />
    </>
  );
}
