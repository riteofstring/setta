import React, { useState, useEffect } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import { HStack, Button, Spacer, Stack, useRadioGroup } from "@chakra-ui/react";
import SectionSearch from "./SectionSearch";
import SelectableItem from "./SelectableItem";

const SectionUI = ({ sectionId, theSection, sectionModuleObjHasNested }) => {
  const inFocus = useStoreState((state) => state.master.inFocus[sectionId]);
  const [searchFocus, setSearchFocus] = useState(false);
  const searchOnClick = (e) => {
    setSearchFocus(e);
  };

  const setIsShown = useStoreActions((actions) => actions.master.setIsShown);
  const isShown = useStoreState((state) => state.master.isShown[sectionId]);
  console.log("SectionUI", sectionId);

  const flipShown = () => {
    setIsShown({ sectionId, isShown: !isShown });
  };

  const options = [
    "test one",
    "test two",
    "test three",
    "test four",
    "test five",
  ];

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: "framework",
    defaultValue: "react",
    onChange: console.log,
  });

  useEffect(() => {
    if (!inFocus) {
      searchOnClick(false);
    }
  });

  const group = getRootProps();

  // console.log("####################SectionUI", sectionId);

  return (
    <HStack spacing="2rem" w="100%">
      <Stack direction="column">
        <SectionSearch searchOnClick={searchOnClick} />
        {!!inFocus && !!inFocus && (
          <Stack maxHeight="10rem" overflowY="auto">
            {options.map((value) => {
              const radio = getRadioProps({ value });
              return (
                <SelectableItem key={value} {...radio}>
                  {value}
                </SelectableItem>
              );
            })}
          </Stack>
        )}
      </Stack>

      {/* <Menu>
        <SectionMenuButton sectionId={sectionId} theSection={theSection} />
        <SectionMenu sectionId={sectionId} theSection={theSection} />
      </Menu> */}
      <Spacer />

      {sectionModuleObjHasNested && (
        <Button onClick={flipShown}>{!!isShown ? "Collapse" : "Show"}</Button>
      )}
    </HStack>
  );
};

export default React.memo(SectionUI);
