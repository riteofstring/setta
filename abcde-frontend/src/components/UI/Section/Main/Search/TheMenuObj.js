import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";

const TheMenuObj = ({ sectionId, moduleName, objName }) => {
  const sectionHasNested = useStoreState(
    (state) => state.master.sectionHasNested[sectionId]
  );
  const setSelected = useStoreActions((actions) => actions.master.setSelected);
  const deleteChildrenFromVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.deleteChildrenFromVisibleSectionIdsThunk
  );
  const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);

  const setSelectedAndCurrObj = () => {
    if (sectionHasNested) {
      deleteChildrenFromVisibleSectionIdsThunk({
        sectionId,
        moduleName,
        objName,
      });
    }
    setCurr({ moduleName, objName });
    setSelected({ sectionId, moduleName, name: objName });
  };

  return <>{objName}</>;
};

export default React.memo(TheMenuObj);
