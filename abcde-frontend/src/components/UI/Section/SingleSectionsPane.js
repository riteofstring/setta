import React, { useEffect, useState } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { Heading, Stack } from "@chakra-ui/react";
import { SectionInfo } from "../../../classes/jsonParser";
import { createNewId } from "../../../utils/sectionIds";

function SingleSectionsPane({ minIdx, maxIdx, groupId, available }) {
  const uiSpecs = useStoreState((state) => state.master.uiSpecs);
  const setIdsOverview = useStoreActions((x) => x.sections.setIdsOverview);
  const setIdNames = useStoreActions((x) => x.sections.setIdNames);

  const [children, setChildren] = useState([]);

  useEffect(() => {
    getSectionIds();
  }, []);

  console.log(
    "SectionsPane rootIds, minIdx, maxIdx",
    uiSpecs,
    minIdx,
    maxIdx,
    available
  );

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
    setIdsOverview({
      sectionId: groupId,
      children: newIds,
    });
    setChildren(newIds);
  }

  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {groupId}
        </Heading>
        {children.map((e, idx) => (
          <SectionContainer
            sectionId={e}
            parentId={null}
            // nextId={idx + 1}
            sectionInfo={getSectionInfo(idx + minIdx)}
            available={available}
            key={`${e}-${idx}`}
            depth={0}
            setIdsOverview={setIdsOverview}
            setIdNames={setIdNames}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SingleSectionsPane);
