import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { useStoreState } from "easy-peasy";
import { useGetSectionType, useReinitSectionType } from "hooks/useCreateInfo";
import _ from "lodash";
import { useState, useEffect } from "react";
import { nullOrUndefined } from "utils/utils";

function configNotEqualToSpecs(config, specs) {
  return (
    !_.isEqual(_.sortBy(config.objects), _.sortBy(specs?.objects)) ||
    !_.isEqual(_.sortBy(config.parameters), _.sortBy(specs?.parameters))
  );
}

export default function SectionConfigFunc() {
  const sectionId = useStoreState((x) => x.master.activeSection);
  const { name, specs } = useGetSectionType(sectionId);
  const specsIsDefined = !nullOrUndefined(specs);
  const reinitSectionType = useReinitSectionType(sectionId);
  const [config, setConfig] = useState(specsIsDefined ? specs : {});

  useEffect(() => {
    if (specsIsDefined) {
      setConfig(specs);
    }
  }, [specs]);

  useEffect(() => {
    if (configNotEqualToSpecs(config, specs)) {
      reinitSectionType({ topLevelSpecs: config });
    }
  }, [config]);

  const onChange = (configName, value) => {
    setConfig((x) => ({ ...x, [configName]: value }));
  };
  return <ParamUIConfig name={name} savedConfig={specs} onChange={onChange} />;
}
