import React from "react";
import { useStoreState } from "easy-peasy";
import SingleSectionsPane from "./SingleSectionsPane";
import { PANEID } from "../../../utils/constants";
import { useSetSectionPosition } from "../../../utils/useSetSectionPosition";
import { Stack } from "@chakra-ui/react";

const SectionsPane = () => {
  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);
  const spaceBetweenPages = useStoreState(
    (state) => state.master.spaceBetweenPages
  );

  const refForPosition = useSetSectionPosition(PANEID);

  return (
    <>
      <Stack
        direction="row"
        spacing={`${spaceBetweenPages}px`}
        ref={refForPosition}
      >
        {pageMinMaxList.map((e, idx) => (
          <SingleSectionsPane
            minId={e.minId}
            maxId={e.maxId}
            idx={idx}
            key={`SingleSectionsPane-${idx}`}
          />
        ))}
      </Stack>
    </>
  );
};

export default React.memo(SectionsPane);
