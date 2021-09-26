import { Flex, HStack, Spacer, GridItem } from "@chakra-ui/react";

import EcoSysButton from "./EcoSysButton/EcoSysButton";
import EnvSelectButton from "./EnvSelect/EnvSelectButton";
import FileMenu from "./FileMenu/FileMenu";
import RunButton from "./RunButton/RunButton";
import SelectMachine from "./SelectMachine/SelectMachine";
import TerminalButton from "./TerminalButton/TerminalButton";

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
