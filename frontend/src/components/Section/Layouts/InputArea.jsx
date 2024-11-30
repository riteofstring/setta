import { SectionYamlView } from "components/Params/YamlView";
import _ from "lodash";
import React from "react";
import { useSectionInfos } from "state/definitions";
import { useSectionSelectedItem } from "state/hooks/sectionVariants";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SectionSearch } from "../SectionParts/Search";
import { useShowYaml } from "./toYaml";

function _InputArea({ sectionId, bgColor }) {
  const selectedItem = useSectionSelectedItem(sectionId);
  const { hideSearch, hideParams } = useSectionInfos((x) => {
    return {
      hideSearch: x.x[sectionId].hideSearch,
      hideParams: x.x[sectionId].hideParams,
    };
  }, _.isEqual);
  const showYaml = useShowYaml(sectionId);

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
      {!!showYaml && <SectionYamlView sectionId={sectionId} />}
    </>
  );
}

export const InputArea = React.memo(_InputArea);
