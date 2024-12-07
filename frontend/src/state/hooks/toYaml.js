import { useEffect, useState } from "react";
import { guiToYaml, yamlToGUI } from "state/actions/guiToYaml";
import { useSectionInfos } from "state/definitions";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function useShowYaml(sectionId) {
  const showYaml = useSectionInfos(
    (x) => x.x[sectionId].displayMode === SECTION_DISPLAY_MODES.YAML,
  );
  const [toYamlWasCalled, setToYamlWasCalled] = useState(false);

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
