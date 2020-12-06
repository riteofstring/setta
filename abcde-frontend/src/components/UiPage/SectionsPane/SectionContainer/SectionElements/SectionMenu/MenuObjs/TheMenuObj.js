import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const TheMenuObj = ({ sectionId, moduleName, name }) => {
  const sectionHasNested = useStoreState((state) => state.master.sectionHasNested[sectionId]);
  const setSelected = useStoreActions((actions) => actions.master.setSelected);
  const deleteFromVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.deleteFromVisibleSectionIdsThunk
  );
  const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);
  console.log("TheMenuObj", sectionId, moduleName, name);

  const setSelectedAndCurrObj = () => {
    if (sectionHasNested) {
      deleteFromVisibleSectionIdsThunk({
        sectionId,
        moduleName,
        objName: name,
      });
    }
    setCurr({ moduleName, objName: name });
    setSelected({ sectionId, moduleName, name });
  };

  return <MenuItem onClick={() => setSelectedAndCurrObj()}>{name}</MenuItem>;
};

export default React.memo(TheMenuObj);
