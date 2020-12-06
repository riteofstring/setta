import React from "react";
import { useStoreActions } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const TheMenuObj = ({ sectionId, moduleName, name, currParams }) => {
  const { setSelected } = useStoreActions((actions) => actions.master);
  const {
    setCurrSectionId,
    setCurrModuleName,
    setCurrObjName,
  } = useStoreActions((actions) => actions.globalCurr);

  const setSelectedAndCurrObj = () => {
    setCurrObjName(name);
    setCurrModuleName(moduleName);
    setCurrSectionId(sectionId);
    // deleteCurrFromVisibleSectionIdsThunk();
    setSelected({ sectionId, moduleName, name, currParams });
  };

  return <MenuItem onClick={() => setSelectedAndCurrObj()}>{name}</MenuItem>;
};

export default React.memo(TheMenuObj);
