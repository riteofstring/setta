import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const TheMenuObj = ({ sectionId, moduleName, name }) => {
  const setSelected = useStoreActions((actions) => actions.master.setSelected);
  const deleteVisibleSectionIds = useStoreActions(
    (actions) => actions.master.deleteVisibleSectionIds
  );
  const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);
  console.log("TheMenuObj")

  const setSelectedAndCurrObj = () => {
    // deleteVisibleSectionIds(sectionId);
    setCurr({ moduleName, objName: name });
    setSelected({ sectionId, moduleName, name });
  };

  return <MenuItem onClick={() => setSelectedAndCurrObj()}>{name}</MenuItem>;
};

export default React.memo(TheMenuObj);
