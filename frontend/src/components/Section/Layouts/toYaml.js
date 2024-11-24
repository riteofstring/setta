import { useEffect, useState } from "react";
import { guiToYaml, yamlToGUI } from "state/actions/guiToYaml";
import { useGetSectionInfo } from "state/hooks/sections";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function useShowYaml(sectionId) {
  const displayMode = useGetSectionInfo(sectionId, "displayMode");
  const [toYamlWasCalled, setToYamlWasCalled] = useState(false);
  const showYaml = displayMode === SECTION_DISPLAY_MODES.YAML;

  useEffect(() => {
    if (showYaml) {
      guiToYaml(sectionId);
      setToYamlWasCalled(true);
    } else {
      if (toYamlWasCalled) {
        yamlToGUI(sectionId);
      }
    }
  }, [showYaml]);

  return showYaml;
}
