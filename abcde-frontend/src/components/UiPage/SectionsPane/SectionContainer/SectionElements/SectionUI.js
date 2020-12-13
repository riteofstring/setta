import React from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import SectionMenu from "./SectionMenu/SectionMenu";
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
} from "@chakra-ui/react";
import SectionMenuButton from "./SectionMenuButton";
import { jsx, css } from "@emotion/react";

const SectionUI = ({ sectionId, theSection, sectionModuleObjHasNested }) => {
  const setIsShown = useStoreActions((actions) => actions.master.setIsShown);
  const isShown = useStoreState((state) => state.master.isShown[sectionId]);
  console.log("SectionUI", sectionId);

  const listBox = css`
    position: fixed;
    opacity: 0;
    pointer-events: none;
  `;

  const flipShown = () => {
    setIsShown({ sectionId, isShown: !isShown });
  };

  console.log("####################SectionUI", sectionId);

  return (
    <HStack spacing="2rem" w="100%">
      <VStack>
        <Input variant="outline" placeholder="Select Section" />
        <VStack width="100%" height="5rem" overflowY="scroll">
          <Radio css={listBox} size="sm" name="1" colorScheme="red">
            Radio
          </Radio>
          <Radio size="sm" name="1" colorScheme="red">
            Radio
          </Radio>
          <Radio size="sm" name="1" colorScheme="red">
            Radio
          </Radio>
        </VStack>
      </VStack>

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
