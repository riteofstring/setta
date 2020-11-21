import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const SingleMenuObj = ({ theSectionName, name, currParams }) => {
  const { globalCurrParams } = useStoreState((state) => state.master);
  const { setSelected } = useStoreActions((actions) => actions.master);
  const { setCurrObjName, setGlobalCurrObj } = useStoreActions(
    (actions) => actions.globalCurrObj
  );

  const setSelectedAndCurrObj = (theSectionName, name, currParams) => {
    setCurrObjName(name);
    setGlobalCurrObj(globalCurrParams);
    setSelected({ theSectionName, name, currParams });
  };

  return (
    <MenuItem
      onClick={() => setSelectedAndCurrObj(theSectionName, name, currParams)}
    >
      {name}
    </MenuItem>
  );
};

export default React.memo(SingleMenuObj);
