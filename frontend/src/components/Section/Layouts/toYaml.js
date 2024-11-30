import { useEffect, useState } from "react";
import { guiToYaml, yamlToGUI } from "state/actions/guiToYaml";
import { useSectionInfos } from "state/definitions";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function useShowYaml(sectionId) {
  const displayMode = useSectionInfos((x) => x.x[sectionId].displayMode);
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
