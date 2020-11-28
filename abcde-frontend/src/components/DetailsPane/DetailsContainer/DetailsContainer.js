import React, { useState, useLayoutEffect } from "react";
import { HStack } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import ParamContainer from "./ParamContainer/ParamContainer";

const DetailsContainer = () => {
  const { selected, activeObj } = useStoreState((state) => state.master);
  const [paramsArr, setParamsArr] = useState([]);

  const loadParams = (paramList) => {
    let localParams = [];
    for (let key in paramList) {
      localParams.push(Object.assign(paramList[key], { name: key }));
    }
    setParamsArr(localParams);
  };

  useLayoutEffect(() => {
    if (activeObj && selected[activeObj].params) {
      let paramList = selected[activeObj].params;
      loadParams(paramList);
    }
    else{
      setParamsArr([])
    }
  }, [selected, activeObj]);

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
