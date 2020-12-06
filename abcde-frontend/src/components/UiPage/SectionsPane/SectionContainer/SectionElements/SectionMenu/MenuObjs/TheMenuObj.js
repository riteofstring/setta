import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const TheMenuObj = ({ sectionId, moduleName, name, currParams }) => {
  const setSelected = useStoreActions((actions) => actions.master.setSelected);
  const deleteVisibleSectionIds = useStoreActions(
    (actions) => actions.master.deleteVisibleSectionIds
  );
  const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);
  const prevSectionId = useStoreState((state) => state.globalCurr.sectionId);
  const prevModuleName = useStoreState((state) => state.globalCurr.moduleName);
  const prevObjName = useStoreState((state) => state.globalCurr.objName);

  
  const setSelectedAndCurrObj = () => {
    if (
      sectionId === prevSectionId &&
      (moduleName !== prevModuleName) | (name !== prevObjName)
    ) {
      deleteVisibleSectionIds(sectionId);
    }
    setCurr({ sectionId, moduleName, objName: name });
    setSelected({ sectionId, moduleName, name, currParams });
  };

  return <MenuItem onClick={() => setSelectedAndCurrObj()}>{name}</MenuItem>;
};

export default React.memo(TheMenuObj);
