import React, { useEffect, useState } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import SectionContainerWrapper from "./SectionContainer/SectionContainer";
import { Heading, Stack } from "@chakra-ui/react";
import { SectionInfo } from "../../../classes/jsonParser";
import { createNewId } from "../../../utils/sectionIds";
import { curryAction, defaultState } from "../../../utils/utils";

function SingleSectionsPane({ minIdx, maxIdx, groupId, available }) {
  const uiSpecs = useStoreState((x) => x.master.uiSpecs);

  const idsOverview = defaultState(
    useStoreState((x) => x.sections.idsOverview[groupId]),
    []
  );

  const setIdsOverview = curryAction(
    useStoreActions((x) => x.sections.setIdsOverview),
    { sectionId: groupId },
    "children"
  );
  const setIdNames = useStoreActions((x) => x.sections.setIdNames);

  useEffect(() => {
    getSectionIds();
  }, []);

  function idxCondition(idx) {
    return idx >= minIdx && idx < maxIdx;
  }

  function getSectionInfo(idx) {
    const variableName = [...uiSpecs.keys()][idx];
    return new SectionInfo(variableName, uiSpecs.get(variableName), available);
  }

  function getSectionIds() {
    let newIds = [];
    for (let idx = 0; idx < uiSpecs.size; idx++) {
      if (idxCondition(idx)) {
        newIds.push(createNewId());
      }
    }
    setIdsOverview(newIds);
  }

  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {groupId}
        </Heading>
        {idsOverview.map((e, idx) => (
          <SectionContainerWrapper
            sectionId={e}
            parentId={null}
            // nextId={idx + 1}
            sectionInfo={getSectionInfo(idx + minIdx)}
            available={available}
            key={`${e}-${idx}`}
            depth={0}
            setIdNames={setIdNames}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SingleSectionsPane);
