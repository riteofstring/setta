import React from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { getRootIds } from "../../../utils/sectionIds";
import { arraysAreEqual } from "../../../utils/commonFunctions";
import { Heading, Stack } from "@chakra-ui/react";

const SingleSectionsPane = ({ minId, maxId }) => {
  const rootSectionsHaveChanged = (prev, next) => {
    const prevIds = prev ? getRootIds(prev, minId, maxId) : [];
    const nextIds = next ? getRootIds(next, minId, maxId) : [];
    return arraysAreEqual(prevIds, nextIds);
  };

  const idHierarchy = useStoreState(
    (state) => state.master.idHierarchy,
    rootSectionsHaveChanged
  );

  const idKeys = idHierarchy ? getRootIds(idHierarchy, minId, maxId) : [];

  console.log("SectionsPane idKeys, minId, maxId", idKeys);

  // temp_
  const tempNum = "1";

  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {tempNum}
        </Heading>
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
      </Stack>
    </>
  );
};

export default React.memo(SingleSectionsPane);
