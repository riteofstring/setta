import React from "react";
import { useStoreActions } from "easy-peasy";
import { MenuItem } from "@chakra-ui/react";

const SingleMenuObj = ({ theSectionName, name, currParams }) => {
  const { setSelected } = useStoreActions((actions) => actions.store);
  return (
    <MenuItem onClick={() => setSelected({ theSectionName, name, currParams })}>
      {name}
    </MenuItem>
  );
};

export default React.memo(SingleMenuObj);
