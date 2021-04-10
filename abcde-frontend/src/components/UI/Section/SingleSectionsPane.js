import React from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { arraysAreEqual } from "../../../utils/commonFunctions";
import { VStack } from "@chakra-ui/react";

const SingleSectionsPane = ({ minId, maxId }) => {
  const rootIds = useStoreState((state) =>
    state.master.sections.getRootIds(minId, maxId),
    arraysAreEqual
  );

  console.log("SectionsPane rootIds, minId, maxId", rootIds);

  return (
    <>
      <VStack>
        {rootIds.map((e, idx) => (
          <SectionContainer
            sectionId={e}
            parentId={null}
            nextId={rootIds[idx + 1]}
            key={`${e}-${idx}`}
            depth={0}
          />
        ))}
      </VStack>
    </>
  );
};

export default React.memo(SingleSectionsPane);
