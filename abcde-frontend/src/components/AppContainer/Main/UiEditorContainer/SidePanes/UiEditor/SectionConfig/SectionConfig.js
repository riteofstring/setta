import { Button } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import {
  useGetSectionInfo,
  useGetSectionType,
  useReinitSectionType,
} from "hooks/useCreateInfo";

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
  const { name, specs } = useGetSectionType(sectionId);
  const reinitSectionType = useReinitSectionType(sectionId);
  const { parentId } = useGetSectionInfo(sectionId);

  const onGoBackClick = () => {
    setActiveSection(parentId);
    setCameFromUIConfig(false);
    setTabIndex(1);
  };

  const onSectionTypeChange = (e) => {
    if (e && e !== name) {
      reinitSectionType({ name: e, topLevelSpecs: specs });
    }
  };

  const onChange = (configName, newValueFn) => {
    const newSpecs = { ...specs, [configName]: newValueFn(specs[configName]) };
    reinitSectionType({ name, topLevelSpecs: newSpecs });
  };

  return (
    <>
      {cameFromUIConfig && <Button onClick={onGoBackClick}>Go back</Button>}
      <SectionConfigTypeSelection
        onChange={onSectionTypeChange}
        currType={name}
      />
      <SectionConfigComp savedConfig={specs} onChange={onChange} />
    </>
  );
}
