import React from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { arraysAreEqual } from "../../../utils/commonFunctions";
import { Heading, Stack } from "@chakra-ui/react";

const SingleSectionsPane = ({ minIdx, maxIdx, idx }) => {
  const rootIds = useStoreState(
    (state) => state.master.sections.getRootIds(minIdx, maxIdx),
    arraysAreEqual
  );

  console.log("SectionsPane rootIds, minIdx, maxIdx", rootIds, minIdx, maxIdx);

  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {idx}
        </Heading>
        {rootIds.map((e, idx) => (
          <SectionContainer
            sectionId={e}
            parentId={null}
            nextId={rootIds[idx + 1]}
            key={`${e}-${idx}`}
            depth={0}
          />
        ))}
      </Stack>
    </>
  );
};

export default React.memo(SingleSectionsPane);
