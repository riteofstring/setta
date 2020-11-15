import React, { useState } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { MenuList, MenuItem, MenuGroup, MenuDivider } from "@chakra-ui/react";

const MenuObj = ({ theSectionName, name, currParams }) => {
  const { setSelected } = useStoreActions((actions) => actions.store);
  return (
    <MenuItem onClick={() => setSelected({ theSectionName, name, currParams })}>
      {name}
    </MenuItem>
  );
};

const MenuObjs = ({ currModuleInfo, theSection }) => {
  const currObjNames = Object.keys(currModuleInfo.objs);

  return (
    <>
      {currObjNames.map((k, idx) => (
        <MenuObj
          name={k}
          theSectionName={theSection.name}
          currParams={currModuleInfo.objs[k].params}
          key={`${k}-${idx}`}
        />
      ))}
    </>
  );
};

const ObjectMenu = ({ theSection }) => {
  const { moduleInfos } = theSection;
  const moduleInfosArr = Object.keys(moduleInfos);

  return (
    <MenuList>
      {moduleInfosArr.map((e, idx) => (
        <MenuGroup title={e} key={`${e}-${idx}`}>
          <MenuDivider />
          {/* List Classes */}
          <MenuObjs currModuleInfo={moduleInfos[e]} theSection={theSection} />
        </MenuGroup>
      ))}
    </MenuList>
  );
};

export default React.memo(ObjectMenu);
