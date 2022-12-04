import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { useEffect, useState } from "react";
import { useReactFlow } from "react-flow-renderer";
import { deleteSections } from "thunks/sectionOps";

import {
  useGetSectionPosition,
  useRequestSectionPositionUpdate,
} from "./useGetSectionPosition";
import { useGetAllChildren } from "./useSectionChildren";

function useMakeChildrenTopLevel(deckId, childIds, requesterName) {
  const setAllChildren = useSectionInfos((x) => x.setAllChildren);
  const setSectionInfoAttrObjInput = useSectionInfos(
    (x) => x.setSectionInfoAttrObjInput
  );
  const addChildren = useProjectConfig((x) => x.addChildren);

  const { project } = useReactFlow();
  function onCoordsReceived(coords) {
    const newValues = {};
    _.forEach(coords, function (value, key) {
      newValues[key] = { initialPosition: project(value) };
    });
    setAllChildren({ sectionId: deckId, newStateFn: () => [] });
    setSectionInfoAttrObjInput({ newValues });
    addChildren(childIds);
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

  // closeContextMenu() happens before state updates.
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
