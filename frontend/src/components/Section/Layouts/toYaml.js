import { useEffect, useState } from "react";
import { guiToYaml, yamlToGUI } from "state/actions/guiToYaml";
import { useOriginalYamlObj, useYamlValue } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function useShowYaml(sectionId) {
  const displayMode = useGetSectionInfo(sectionId, "displayMode");
  const [yamlFetchComplete, setYamlFetchComplete] = useState(false);
  const yamlValue = useYamlValue((x) => x[sectionId] ?? "");
  const originalObj = useOriginalYamlObj((x) => x[sectionId] ?? {});

  function setYamlValue(v) {
    useYamlValue.setState({ [sectionId]: v });
  }
  function setOriginalObj(v) {
    useOriginalYamlObj.setState({ [sectionId]: v });
  }

  const yamlIsNeeded = displayMode === SECTION_DISPLAY_MODES.YAML;
  const showYaml = yamlIsNeeded && yamlFetchComplete;

  async function fn() {
    if (yamlIsNeeded) {
      await guiToYaml(sectionId, setYamlValue, setOriginalObj);
      setYamlFetchComplete(true);
    } else {
      if (yamlFetchComplete) {
        setYamlFetchComplete(false);
        yamlToGUI(sectionId, yamlValue, originalObj);
      }
    }
  }

  useEffect(() => {
    fn();
  }, [yamlIsNeeded]);

  return {
    showYaml,
    yamlValue,
    setYamlValue,
  };
}
