import { useStoreState } from "easy-peasy";
import { useGetSectionType, useReinitSectionType } from "hooks/useCreateInfo";

import SectionConfigComp from "./SectionConfigComp";
import SectionConfigTypeSelection from "./SectionConfigTypeSelection";

export default function SectionConfigFunc() {
  const sectionId = useStoreState((x) => x.master.activeSection);
  const { name, specs } = useGetSectionType(sectionId);
  const reinitSectionType = useReinitSectionType(sectionId);

  const onSectionTypeChange = (e) => {
    reinitSectionType({ name: e, topLevelSpecs: specs });
  };

  const onChange = (configName, newValueFn) => {
    const newSpecs = { ...specs, [configName]: newValueFn(specs[configName]) };
    reinitSectionType({ name, topLevelSpecs: newSpecs });
  };

  return (
    <>
      <SectionConfigTypeSelection
        onChange={onSectionTypeChange}
        currType={name}
      />
      <SectionConfigComp savedConfig={specs} onChange={onChange} />
    </>
  );
}
