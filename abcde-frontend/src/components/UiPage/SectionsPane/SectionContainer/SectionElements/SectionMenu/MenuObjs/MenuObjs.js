import React from "react";
import TheMenuObj from "./TheMenuObj";

const MenuObjs = ({ currModuleInfo, sectionId }) => {
  const currObjNames = Object.keys(currModuleInfo.objs);
  return (
    <>
      {currObjNames.map((k, idx) => (
        <TheMenuObj
          name={k}
          sectionId={sectionId}
          moduleName={currModuleInfo.name}
          currParams={currModuleInfo.objs[k].params}
          key={`${k}-${idx}`}
        />
      ))}
    </>
  );
};

export default React.memo(MenuObjs);
