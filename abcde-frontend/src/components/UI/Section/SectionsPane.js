import React from "react";
import { useStoreState } from "easy-peasy";
import SingleSectionsPane from "./SingleSectionsPane";
import { HStack } from "@chakra-ui/react";
import { PANEID } from "../../../utils/constants";
import { useSetSectionPosition } from "../../../utils/useSetSectionPosition";

const SectionsPane = () => {
  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);
  const spaceBetweenPages = useStoreState(
    (state) => state.master.spaceBetweenPages
  );

  const refForPosition = useSetSectionPosition(PANEID);

  return (
    <>
      <HStack spacing={`${spaceBetweenPages}px`} ref={refForPosition}>
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
