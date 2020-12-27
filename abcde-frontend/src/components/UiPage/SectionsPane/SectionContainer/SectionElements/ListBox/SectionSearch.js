import React from "react";
import { Input, InputGroup, InputLeftElement } from "@chakra-ui/react";
import { GrFormSearch } from "react-icons/gr";
import { useStoreState, useStoreActions } from "easy-peasy";

const SectionSearch = ({ searchOnClick }) => {
  const searchTerm = useStoreState((state) => state.master.sectionSearchVal);
  const setSearchTerm = useStoreActions(
    (actions) => actions.master.setSectionSearchVal
  );

  const handleChange = (event) => {
    setSearchTerm(event.target.value);
  };

  return (
    <InputGroup>
      <Input
        placeholder="search"
        value={searchTerm}
        onChange={handleChange}
        focusBorderColor="brand.500"
        onClick={() => {
          searchOnClick(true);
        }}
      />
      <InputLeftElement px="0.6rem" children={<GrFormSearch size="1.5em" />} />
    </InputGroup>
  );
};

export default React.memo(SectionSearch);
