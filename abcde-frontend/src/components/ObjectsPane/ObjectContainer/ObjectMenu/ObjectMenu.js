import React from "react";
import { MenuList, MenuGroup, MenuDivider } from "@chakra-ui/react";
import MenuObjs from "./MenuObjs/MenuObjs";

const ObjectMenu = ({ sectionId, theSection }) => {
  const { moduleInfos } = theSection;
  const moduleInfosArr = Object.keys(moduleInfos);

  return (
    <MenuList>
      {moduleInfosArr.map((e, idx) => (
        <MenuGroup title={e} key={`${e}-${idx}`}>
          <MenuDivider />
          {/* List Classes */}
          <MenuObjs
            currModuleInfo={moduleInfos[e]}
            sectionId={sectionId}
            theSection={theSection}
          />
        </MenuGroup>
      ))}
    </MenuList>
  );
};

export default React.memo(ObjectMenu);
