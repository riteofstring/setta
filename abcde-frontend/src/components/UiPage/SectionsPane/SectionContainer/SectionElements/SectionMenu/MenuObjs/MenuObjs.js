import React, { useState, useEffect } from "react";
import TheMenuObj from "./TheMenuObj";
import { useRadioGroup } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";

const MenuObjs = ({ currModuleInfo, sectionId }) => {
  const selected = useStoreState((state) => state.master.selected[sectionId]);

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

  const getDefaultSelection = () => {
    if (selected.moduleName == currModuleInfo.name) {
      return selected.name;
    }
    return null;
  };

  const { getRadioProps } = useRadioGroup({
    name: sectionId,
    defaultValue: getDefaultSelection(),
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
