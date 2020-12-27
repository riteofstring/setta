import React from "react";
import TheMenuObj from "./TheMenuObj";

const MenuObjs = ({ currModuleInfo, sectionId }) => {
  console.log("MenuObjs");

  return (
    <>
      {Object.keys(currModuleInfo.objs).map((k, idx) => (
        <TheMenuObj
          name={k}
          sectionId={sectionId}
          moduleName={currModuleInfo.name}
          key={`${k}-${idx}`}
        />
      ))}
    </>
  );
};

export default React.memo(MenuObjs);
