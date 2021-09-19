import React, { useEffect, useState } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { Heading, Stack } from "@chakra-ui/react";
import { SectionInfo } from "../../../classes/jsonParser";
import { createNewId } from "../../../utils/sectionIds";
import { useAtom } from "jotai";
import { useAtomValue } from "jotai/utils";
import { sectionChildren as sectionChildrenState } from "./state";

function SingleSectionsPane({
  minIdx,
  maxIdx,
  groupId,
  available,
  groupChildren,
}) {
  const uiSpecs = useStoreState((state) => state.master.uiSpecs);
  const [children, setChildren] = useAtom(groupChildren);
  const sectionChildren = useAtomValue(sectionChildrenState);
  const setIdNames = useStoreActions((actions) => actions.master.setIdNames);

  useEffect(() => {
    const sectionIds = getSectionIds();
    console.log("groupId sectionIds", groupId, sectionIds);
    setChildren(sectionIds);
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

  function getSectionInfo(variableName) {
    return new SectionInfo(variableName, uiSpecs[variableName], available);
  }

  function getSectionIds() {
    let newIds = [];
    for (let idx = 0; idx < Object.keys(uiSpecs).length; idx++) {
      if (idxCondition(idx)) {
        newIds.push(createNewId());
      }
    }
    return newIds;
  }

  console.log("SingleSectionsPane groupChildren", children);

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
            sectionInfo={getSectionInfo(Object.keys(uiSpecs)[idx + minIdx])}
            available={available}
            key={`${e}-${idx}`}
            depth={0}
            setIdNames={setIdNames}
            sectionChildren={sectionChildren[e]}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SingleSectionsPane);
