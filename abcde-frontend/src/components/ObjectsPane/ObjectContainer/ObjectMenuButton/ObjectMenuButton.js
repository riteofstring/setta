import React, { useState, useEffect } from "react";
import { useStoreState } from "easy-peasy";
import { HiChevronDown } from "react-icons/hi";
import { MenuButton, Button } from "@chakra-ui/react";

const ObjectMenuButton = ({ theSection }) => {
  const { selected, activeObj } = useStoreState((state) => state.master);
  const [currName, setCurrName] = useState("");

  const loadParams = (currObjName) => {
    setCurrName(currObjName);
  };

  useEffect(() => {
    if (selected[activeObj]) {
      let currObjName = selected[activeObj].name;
      loadParams(currObjName);
    }
  }, [selected, activeObj]);

  console.log();

  return (
    <>
      {Object.keys(theSection.moduleInfos).length > 0 ? (
        <MenuButton as={Button} rightIcon={<HiChevronDown />}>
          {activeObj
            ? theSection.name === activeObj && currName
            : "Select " + theSection.name}
        </MenuButton>
      ) : (
        <Button as={Button}>Edit</Button>
      )}
    </>
  );
};

export default React.memo(ObjectMenuButton);
