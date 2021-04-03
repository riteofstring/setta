import { Flex, HStack, Spacer, GridItem } from "@chakra-ui/react";

import FileMenu from "./FileMenu/FileMenu";
import SelectMachine from "./SelectMachine/SelectMachine";
import EnvSelectButton from "./EnvSelect/EnvSelectButton";
import TerminalButton from "./TerminalButton/TerminalButton";
import RunButton from "./RunButton/RunButton";
import EcoSysButton from "./EcoSysButton/EcoSysButton";

export default function SubNav() {
  return (
    <GridItem colStart="1" colEnd="end" rowStart="1" rowEnd="2">
      <Flex
        justify="center"
        width="100vw"
        borderBottom="1px"
        borderColor="gray.200"
        backgroundColor="gray.50"
      >
        <HStack height="3rem" width="calc(90vw)" spacing={2}>
          <FileMenu />
          <EcoSysButton />
          {/* <UiEditButton /> */}
          {/* <TerminalButton /> */}
          <Spacer />
          <EnvSelectButton />
          <SelectMachine />
          <RunButton />
        </HStack>
      </Flex>
    </GridItem>
  );
}
