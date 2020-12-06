import React from "react";
import { HStack } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import ParamContainer from "./ParamContainer/ParamContainer";

const DetailsContainer = () => {
  const sections = useStoreState((state) => state.master.sections);
  const sectionId = useStoreState((state) => state.globalCurr.sectionId);
  const moduleName = useStoreState((state) => state.globalCurr.moduleName);
  const objName = useStoreState((state) => state.globalCurr.objName);
  const selected = useStoreState((state) => state.master.selected);
  const getParamsArr = () => {
    try {
      let output = [];
      const { moduleName: localModuleName, name: localObjName } = selected[
        sectionId
      ];
      if (moduleName === localModuleName && objName === localObjName) {
        const paramSource =
          sections[sectionId].moduleInfos[moduleName].objs[objName].params;
        for (let key of Object.keys(paramSource)) {
          output.push(paramSource[key]);
        }
      }
      return output;
    } catch (err) {
      return [];
    }
  };

  const paramsArr = getParamsArr();

  console.log("DetailsContainer paramsArr", paramsArr);

  return (
    <HStack>
      {paramsArr.length > 0 &&
        paramsArr.map((e, idx) => (
          <ParamContainer key={`${e.name}-${idx}`} parameters={e} />
        ))}
    </HStack>
  );
};

export default DetailsContainer;
