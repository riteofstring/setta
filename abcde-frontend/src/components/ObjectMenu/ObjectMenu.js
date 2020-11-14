import React from "react";
import { useState } from "react";
import { MenuList, MenuItem, MenuGroup } from "@chakra-ui/core";

const ObjectMenu = ({ theSection }) => {
  const [visible, setVisible] = useState(true);
  const flipVisible = () => {
    setVisible(!visible);
  };

  const moduleInfos = theSection.moduleInfos;

  return (
    <MenuList>
      {moduleInfos.map((e, idx) => (
        <MenuGroup title={e.name} key={`${e.name}-${idx}`}>
          {e.classes.map((k) => (
            <MenuItem key={`${k.name}-${idx}`}>{k.name}</MenuItem>
          ))}
          {e.functions.map((k) => (
            <MenuItem key={`${k.name}-${idx}`}>{k.name}</MenuItem>
          ))}
        </MenuGroup>
      ))}
    </MenuList>
  );
};

export default ObjectMenu;
