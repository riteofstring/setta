import React from "react";
import { useStoreState } from "easy-peasy";
import SingleSectionsPane from "./SingleSectionsPane";
import { HStack } from "@chakra-ui/react";

const SectionsPane = () => {
  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);
  const spaceBetweenPages = useStoreState(
    (state) => state.master.spaceBetweenPages
  );

  return (
    <>
      <HStack spacing={`${spaceBetweenPages}px`}>
        {pageMinMaxList.map((e, idx) => (
          <SingleSectionsPane
            minId={e.minId}
            maxId={e.maxId}
            key={`SingleSectionsPane-${idx}`}
          />
        ))}
      </HStack>
    </>
  );
};

export default React.memo(SectionsPane);
