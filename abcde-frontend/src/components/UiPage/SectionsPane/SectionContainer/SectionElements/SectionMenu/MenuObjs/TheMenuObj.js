import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const TheMenuObj = ({ sectionId, moduleName, name, currParams }) => {
  const { setSelected, deleteVisibleSectionIds } = useStoreActions(
    (actions) => actions.master
  );
  const { setCurr } = useStoreActions((actions) => actions.globalCurr);
  const {
    sectionId: prevSectionId,
    moduleName: prevModuleName,
    objName: prevObjName,
  } = useStoreState((state) => state.globalCurr);

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
