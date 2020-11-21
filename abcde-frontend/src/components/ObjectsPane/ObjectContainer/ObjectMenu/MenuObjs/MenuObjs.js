import React from "react";
import TheMenuObj from "./TheMenuObj";

const MenuObjs = ({ currModuleInfo, theSection }) => {
  const currObjNames = Object.keys(currModuleInfo.objs);

  return (
    <>
      {currObjNames.map((k, idx) => (
        <TheMenuObj
          name={k}
          sectionName={theSection.name}
          moduleName={currModuleInfo.name}
          currParams={currModuleInfo.objs[k].params}
          key={`${k}-${idx}`}
        />
      ))}
    </>
  );
};

export default React.memo(MenuObjs);
