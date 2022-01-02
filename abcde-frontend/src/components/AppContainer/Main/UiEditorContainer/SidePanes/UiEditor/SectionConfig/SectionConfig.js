import { useStoreState } from "easy-peasy";
import { useGetSectionType, useReinitSectionType } from "hooks/useCreateInfo";

import SectionConfigComp from "./SectionConfigComp";

export default function SectionConfigFunc() {
  const sectionId = useStoreState((x) => x.master.activeSection);
  const { name, specs } = useGetSectionType(sectionId);
  const reinitSectionType = useReinitSectionType(sectionId);

  const onChange = (configName, newValueFn) => {
    const newSpecs = { ...specs, [configName]: newValueFn(specs[configName]) };
    reinitSectionType({ topLevelSpecs: newSpecs });
  };
  return <SectionConfigComp savedConfig={specs} onChange={onChange} />;
}
