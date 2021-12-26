import { Flex, HStack, Spacer, GridItem } from "@chakra-ui/react";
import { useLocation } from "react-router-dom";

import EcoSysButton from "./EcoSysButton/EcoSysButton";
import EnvSelectButton from "./EnvSelect/EnvSelectButton";
import FileMenu from "./FileMenu/FileMenu";
import RunButton from "./RunButton/RunButton";
import SelectMachine from "./SelectMachine/SelectMachine";

export default function SubNav() {
  const location = useLocation();
  console.log("location: ", location.pathname);
  return (
    <GridItem colStart="1" colEnd="end" rowStart="1" rowEnd="2">
      <Flex
        justify="center"
        width="100vw"
        borderBottom="1px"
        borderColor="gray.200"
        backgroundColor="gray.50"
      >
        <HStack height="3rem" width="calc(100vw - 5rem)" spacing={2}>
          {location.pathname === "/" && <UiEditorSubNav />}
          {location.pathname === "/start" && <StartPageSubNav />}
        </HStack>
      </Flex>
    </GridItem>
  );
}

function UiEditorSubNav() {
  return (
    <>
      <FileMenu />
      <EcoSysButton />
      {/* <UiEditButton /> */}
      {/* <TerminalButton /> */}
      <Spacer />
      <EnvSelectButton />
      <SelectMachine />
      <RunButton />
    </>
  );
}

function StartPageSubNav() {
  return (
    <>
      <h1>test</h1>
    </>
  );
}
