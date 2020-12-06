import React from "react";
import { useStoreActions } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const TheMenuObj = ({ sectionId, moduleName, name }) => {
  const setSelected = useStoreActions((actions) => actions.master.setSelected);
  const deleteFromVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.deleteFromVisibleSectionIdsThunk
  );
  const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);
  console.log("TheMenuObj")

  const setSelectedAndCurrObj = () => {
    deleteFromVisibleSectionIdsThunk({sectionId, moduleName, objName: name});
    setCurr({ moduleName, objName: name });
    setSelected({ sectionId, moduleName, name });
  };

  return <MenuItem onClick={() => setSelectedAndCurrObj()}>{name}</MenuItem>;
};

export default React.memo(TheMenuObj);
