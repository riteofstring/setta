import React, { useState, useEffect } from "react";
import TheMenuObj from "./TheMenuObj";
import { useRadioGroup } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";

const MenuObjs = ({ currModuleInfo, sectionId }) => {
  const searchTerm = useStoreState(
    (state) => state.master.sectionSearchVal[sectionId]
  );
  const getInitialSearchResults = () => {
    if (searchTerm !== undefined) {
      return filterResults();
    } else {
      return Object.keys(currModuleInfo.objs);
    }
  };

  const filterResults = () => {
    return Object.keys(currModuleInfo.objs).filter((res) =>
      res.toLowerCase().includes(searchTerm)
    );
  };

  const [searchResults, setSearchResults] = useState(getInitialSearchResults());

  useEffect(() => {
    if (searchTerm !== undefined) {
      setSearchResults(filterResults());
    }
  }, [searchTerm]);

  const { getRadioProps } = useRadioGroup({
    name: sectionId,
  });

  return (
    <>
      {searchResults.map((e, idx) => {
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
