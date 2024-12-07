import { useEffect } from "react";
import { guiToYaml, yamlToGUI } from "state/actions/guiToYaml";
import { useSectionInfos, useYamlValueIsInitialized } from "state/definitions";
import { SECTION_DISPLAY_MODES } from "utils/constants";

export function useShowYaml(sectionId) {
  const showYaml = useSectionInfos(
    (x) => x.x[sectionId].displayMode === SECTION_DISPLAY_MODES.YAML,
  );
  const yamlValueIsInitialized = useYamlValueIsInitialized((x) => x[sectionId]);

  useEffect(() => {
    if (showYaml) {
      guiToYaml(sectionId);
    } else {
      if (yamlValueIsInitialized) {
        yamlToGUI(sectionId);
      }
    }
  }, [showYaml]);

  return showYaml;
}
