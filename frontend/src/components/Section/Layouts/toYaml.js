import { useEffect, useState } from "react";
import { guiToYaml, yamlToGUI } from "state/actions/guiToYaml";
import { useOriginalYamlObj, useYamlValue } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function useShowYaml(sectionId) {
  const displayMode = useGetSectionInfo(sectionId, "displayMode");
  const [toYamlWasCalled, setToYamlWasCalled] = useState(false);
  const yamlValue = useYamlValue((x) => x[sectionId] ?? "");
  const originalObj = useOriginalYamlObj((x) => x[sectionId] ?? {});
  const showYaml = displayMode === SECTION_DISPLAY_MODES.YAML;
  function setYamlValue(v) {
    useYamlValue.setState({ [sectionId]: v });
  }
  function setOriginalObj(v) {
    useOriginalYamlObj.setState({ [sectionId]: v });
  }

  useEffect(() => {
    if (showYaml) {
      guiToYaml(sectionId, setYamlValue, setOriginalObj);
      setToYamlWasCalled(true);
    } else {
      if (toYamlWasCalled) {
        yamlToGUI(sectionId, yamlValue, originalObj);
      }
    }
  }, [showYaml]);

  return {
    showYaml,
    yamlValue,
    setYamlValue,
  };
}
