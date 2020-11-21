import React from "react";
import SingleMenuObj from "./SingleMenuObj";

const MenuObjs = ({ currModuleInfo, theSection }) => {
  const currObjNames = Object.keys(currModuleInfo.objs);

  return (
    <>
      {currObjNames.map((k, idx) => (
        <SingleMenuObj
          name={k}
          theSectionName={theSection.name}
          moduleName={currModuleInfo.name}
          currParams={currModuleInfo.objs[k].params}
          key={`${k}-${idx}`}
        />
      ))}
    </>
  );
};

export default React.memo(MenuObjs);
