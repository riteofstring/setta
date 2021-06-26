import React from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { arraysAreEqual } from "../../../utils/commonFunctions";
import { Heading, Stack } from "@chakra-ui/react";

const SingleSectionsPane = ({ minIdx, maxIdx, idx }) => {
  const uiSpecs = useStoreState((state) => state.master.uiSpecs);

  console.log("SectionsPane rootIds, minIdx, maxIdx", uiSpecs, minIdx, maxIdx);

  function idxCondition(idx) {
    return idx >= minIdx && idx < maxIdx;
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
                id={idx}
                variableName={e}
                parentId={null}
                nextId={idx + 1}
                key={`${e}-${idx}`}
                depth={0}
              />
            )
        )}
      </Stack>
    </>
  );
};

export default React.memo(SingleSectionsPane);
