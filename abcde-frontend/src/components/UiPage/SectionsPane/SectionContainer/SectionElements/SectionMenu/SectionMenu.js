import React from "react";
import { MenuList, MenuGroup, MenuDivider } from "@chakra-ui/react";
import MenuObjs from "./MenuObjs/MenuObjs";

const SectionMenu = ({ sectionId, theSection }) => {
  console.log("SectionMenu")

  return (
    <MenuList>
      {Object.keys(theSection.moduleInfos).map((e, idx) => (
        <MenuGroup title={e} key={`${e}-${idx}`}>
          <MenuDivider />
          {/* List Classes */}
          <MenuObjs
            currModuleInfo={theSection.moduleInfos[e]}
            sectionId={sectionId}
          />
        </MenuGroup>
      ))}
    </MenuList>
  );
};

export default React.memo(SectionMenu);
