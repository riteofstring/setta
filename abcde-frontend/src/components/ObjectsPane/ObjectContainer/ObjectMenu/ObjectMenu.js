import React from "react";
import { useStoreActions } from "easy-peasy";
import { MenuList, MenuItem, MenuGroup, MenuDivider } from "@chakra-ui/react";

const ObjectMenu = ({ theSection }) => {
  const moduleInfos = theSection.moduleInfos;

  const setSelected = useStoreActions((actions) => actions.store.setSelected);

  console.log(theSection);

  const MenuObj = ({ theSection, name }) => {
    return (
      <MenuItem onClick={() => setSelected({ theSection, name })}>
        {name}
      </MenuItem>
    );
  };

  return (
    <MenuList>
      {moduleInfos.map((e, idx) => (
        <MenuGroup title={e.name} key={`${e.name}-${idx}`}>
          <MenuDivider />
          {/* List Classes */}
          {e.objs.map((k) => (
            <MenuObj name={k.name} theSection={theSection.name} key={k.name} />
          ))}
        </MenuGroup>
      ))}
    </MenuList>
  );
};

export default ObjectMenu;
