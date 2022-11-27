import { useStoreActions } from "easy-peasy";
import _ from "lodash";
import { useEffect, useState } from "react";
import { useReactFlow } from "react-flow-renderer";

import {
  useGetSectionPosition,
  useRequestSectionPositionUpdate,
} from "./useGetSectionPosition";
import { useGetAllChildren } from "./useSectionChildren";

function useMakeChildrenTopLevel(deckId, childIds, requesterName) {
  const setAllChildren = useStoreActions((x) => x.sectionInfos.setAllChildren);
  const setSectionInfoAttrObjInput = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttrObjInput
  );
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);

  const { project } = useReactFlow();
  function onCoordsReceived(coords) {
    const newValues = {};
    _.forEach(coords, function (value, key) {
      newValues[key] = { initialPosition: project(value), isTopLevel: true };
    });
    setAllChildren({ sectionId: deckId, newStateFn: () => [] });
    setSectionInfoAttrObjInput({ newValues });
    deleteSections({ sectionIds: [deckId] });
  }

  useGetSectionPosition(childIds, requesterName, onCoordsReceived);
}

export function useUndeck(sectionId) {
  const [deckId, setDeckId] = useState(null);
  const requesterName = `useUndeck-${deckId}`;
  const childIds = useGetAllChildren(deckId);
  const requestPositionUpdate = useRequestSectionPositionUpdate();
  useMakeChildrenTopLevel(deckId, childIds, requesterName);

  // closeContextMenu() happens before easy-peasy state updates.
  // So sectionId ends up being null by the time onCoordsReceived is called
  // Therefore, only update deckId when sectionId is not null
  useEffect(() => {
    if (sectionId) {
      setDeckId(sectionId);
    }
  }, [sectionId]);

  return () => {
    requestPositionUpdate(childIds, requesterName);
  };
}
