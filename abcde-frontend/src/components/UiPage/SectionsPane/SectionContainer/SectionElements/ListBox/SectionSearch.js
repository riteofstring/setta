import React from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import {
  HStack,
  VStack,
  Menu,
  Button,
  Spacer,
  Input,
  MenuItem,
  Select,
  Radio,
  InputGroup,
  InputLeftElement,
} from "@chakra-ui/react";
import styled from "@emotion/styled";
import { GrFormSearch } from "react-icons/gr";

const SectionSearch = ({ searchOnClick }) => {
  return (
    <InputGroup>
      <Input
        placeholder="testSearch"
        // value={searchValue}
        // onChange={handleChange}
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
