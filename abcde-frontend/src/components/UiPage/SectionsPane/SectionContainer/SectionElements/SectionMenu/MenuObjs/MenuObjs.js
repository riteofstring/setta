import React from "react";
import TheMenuObj from "./TheMenuObj";
import { useRadioGroup } from "@chakra-ui/react";

const MenuObjs = ({ currModuleInfo, sectionId }) => {
  const { getRadioProps } = useRadioGroup({
    name: sectionId,
    defaultValue: "resnet101",
  });
  return (
    <>
      {Object.keys(currModuleInfo.objs).map((e, idx) => {
        const radio = getRadioProps({ value: e });

        return (
          <TheMenuObj
            objName={e}
            sectionId={sectionId}
            moduleName={currModuleInfo.name}
            key={`tmo-${e}-${idx}`}
            {...radio}
          />
        );
      })}
    </>
  );
};

export default React.memo(MenuObjs);
