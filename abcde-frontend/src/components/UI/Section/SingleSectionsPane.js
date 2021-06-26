import React from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { arraysAreEqual } from "../../../utils/commonFunctions";
import { Heading, Stack } from "@chakra-ui/react";
import { SectionInfo } from "../../../classes/jsonParser";

function SingleSectionsPane({ minIdx, maxIdx, idx, available }) {
  const uiSpecs = useStoreState((state) => state.master.uiSpecs);

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

  function getSectionInfo(variableName, specs) {
    return new SectionInfo(variableName, specs, available);
  }

  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {idx}
        </Heading>
        {Object.keys(uiSpecs).map(
          (e, idx) =>
            idxCondition(idx) && (
              <SectionContainer
                sectionId={idx}
                parentId={null}
                nextId={idx + 1}
                sectionInfo={getSectionInfo(e, uiSpecs[e])}
                available={available}
                key={`${e}-${idx}`}
                depth={0}
              />
            )
        )}
      </Stack>
    </>
  );
}

export default React.memo(SingleSectionsPane);
