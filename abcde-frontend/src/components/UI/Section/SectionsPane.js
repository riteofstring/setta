import React, { useRef, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SingleSectionsPane from "./SingleSectionsPane";
import { HStack } from "@chakra-ui/react";
import { PANEID } from "../../../utils/constants";

const SectionsPane = () => {
  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);
  const spaceBetweenPages = useStoreState(
    (state) => state.master.spaceBetweenPages
  );

  const refForPosition = useRef(null);

  const setSectionPosition = useStoreActions(
    (action) => action.sectionPositions.setSectionPosition
  );

  const setPositionUpdated = useStoreActions(
    (action) => action.sectionPositions.setPositionUpdated
  );

  const setPositionUpdateRequested = useStoreActions(
    (action) => action.sectionPositions.setPositionUpdateRequested
  );

  const positionUpdateRequested = useStoreState(
    (state) => state.sectionPositions.positionUpdateRequested[PANEID]
  );

  useEffect(() => {
    if (positionUpdateRequested && refForPosition.current) {
      const { y, x } = refForPosition.current.getBoundingClientRect();
      setSectionPosition({ sectionId: PANEID, y: y, x: x });
      setPositionUpdateRequested({
        sectionId: PANEID,
        positionUpdateRequested: false,
      });
      setPositionUpdated({ sectionId: PANEID, positionUpdated: true });
    }
  }, [positionUpdateRequested]);

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
