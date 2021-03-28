import React from "react";
import { useStoreState } from "easy-peasy";
import SingleSectionsPane from "./SingleSectionsPane";
import { HStack } from "@chakra-ui/react";

const SectionsPane = () => {
  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);

  return (
    <>
      <HStack spacing="500px">
        {pageMinMaxList.map((e) => (
          <SingleSectionsPane minId={e.minId} maxId={e.maxId} />
        ))}
      </HStack>
    </>
  );
};

export default React.memo(SectionsPane);
