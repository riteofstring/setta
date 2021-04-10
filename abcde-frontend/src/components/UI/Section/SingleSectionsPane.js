import React from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { getRootIds } from "../../../utils/sectionIds";
import { arraysAreEqual } from "../../../utils/commonFunctions";
import { VStack } from "@chakra-ui/react";

const SingleSectionsPane = ({ minId, maxId }) => {
  // const rootSectionsHaveChanged = (prev, next) => {
  //   const prevIds = prev ? getRootIds(prev, minId, maxId) : [];
  //   const nextIds = next ? getRootIds(next, minId, maxId) : [];
  //   return arraysAreEqual(prevIds, nextIds);
  // };

  const sections = useStoreState(
    (state) => state.master.sections,
    // rootSectionsHaveChanged
  );

  const idKeys = sections ? sections.getRootIds(minId, maxId) : [];

  console.log("SectionsPane idKeys, minId, maxId", idKeys);

  return (
    <>
      <VStack>
        {idKeys.map((e, idx) => (
          <SectionContainer
            sectionId={e}
            rootId={e}
            parentId={null}
            nextId={idKeys[idx + 1]}
            key={`${e}-${idx}`}
            depth={0}
          />
        ))}
      </VStack>
    </>
  );
};

export default React.memo(SingleSectionsPane);
