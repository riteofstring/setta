import React from "react";
import { useStoreActions } from "easy-peasy";
import { MenuList, MenuItem, MenuGroup, MenuDivider } from "@chakra-ui/core";

const ObjectMenu = ({ theSection }) => {
  const moduleInfos = theSection.moduleInfos;
  const setSelected = useStoreActions((actions) => actions.store.setSelected);

  const MenuObj = ({ name }) => {
    return <MenuItem onClick={() => setSelected(name)}>{name}</MenuItem>;
  };

  return (
    <MenuList>
      {moduleInfos.map((e, idx) => (
        <MenuGroup title={e.name} key={`${e.name}-${idx}`}>
          {/* List Classes */}
          {e.classes.map((k) => (
            <MenuObj name={k.name} key={k.name} />
          ))}

          {/* Divider if both functions and classes exist */}
          {!!e.classes.length > 0 && !!e.functions.length > 0 && (
            <MenuDivider />
          )}

          {/* List Functions */}
          {e.functions.map((k) => (
            <MenuObj name={k.name} key={k.name} />
          ))}
        </MenuGroup>
      ))}
    </MenuList>
  );
};

export default ObjectMenu;
