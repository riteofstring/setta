import { YamlView } from "components/Params/YamlView";
import React from "react";
import { useGetSectionInfo } from "state/hooks/sections";
import { useSectionSelectedItem } from "state/hooks/sectionVariants";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SectionSearch } from "../SectionParts/Search";
import { useShowYaml } from "./toYaml";

function _InputArea({ sectionId, bgColor }) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const hideSearch = useGetSectionInfo(sectionId, "hideSearch");
  const hideParams = useGetSectionInfo(sectionId, "hideParams");
  const { showYaml, yamlValue, setYamlValue } = useShowYaml(sectionId);

  return (
    <>
      {!showYaml && !hideSearch && (
        <SectionSearch sectionId={sectionId} selectedItem={selectedItem} />
      )}
      {!showYaml && !hideParams && (
        <>
          <KwargsControls
            sectionId={sectionId}
            objInfoId={selectedItem}
            bgColor={bgColor}
          />
          <ParamGroupContainer sectionId={sectionId} />
        </>
      )}
      {!!showYaml && (
        <YamlView
          sectionId={sectionId}
          yamlValue={yamlValue}
          setYamlValue={setYamlValue}
        />
      )}
    </>
  );
}

export const InputArea = React.memo(_InputArea);
