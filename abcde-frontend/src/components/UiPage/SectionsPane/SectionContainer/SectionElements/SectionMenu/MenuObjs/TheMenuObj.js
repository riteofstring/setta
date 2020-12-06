import React from "react";
import { useStoreActions } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const TheMenuObj = ({ sectionId, moduleName, name, currParams }) => {
  const { setSelected } = useStoreActions((actions) => actions.master);
  const { setCurr } = useStoreActions((actions) => actions.globalCurr);

  const setSelectedAndCurrObj = () => {
    setCurr({ sectionId, moduleName, objName: name });
    // deleteCurrFromVisibleSectionIdsThunk();
    setSelected({ sectionId, moduleName, name, currParams });
  };

  return <MenuItem onClick={() => setSelectedAndCurrObj()}>{name}</MenuItem>;
};

export default React.memo(TheMenuObj);
