import {
  Flex,
  HStack,
  Spacer,
  GridItem,
  Center,
  Divider,
} from "@chakra-ui/react";
import { useLocation, Link } from "react-router-dom";

import EcoSysButton from "./EcoSysButton/EcoSysButton";
import EnvSelectButton from "./EnvSelect/EnvSelectButton";
import FileMenu from "./FileMenu/FileMenu";
import RunButton from "./RunButton/RunButton";
import SelectMachine from "./SelectMachine/SelectMachine";

export default function SubNav() {
  const location = useLocation();
  // console.log("location: ", location.pathname);
  return (
    // <GridItem colStart="1" colEnd="end" rowStart="1" rowEnd="2">
    <Flex>
      <HStack spacing={2}>
        <Divider orientation="vertical" pr=".5rem" />

        {location.pathname === "/" && <UiEditorSubNav />}
        {location.pathname === "/start" && <StartPageSubNav />}
      </HStack>
    </Flex>
    // </GridItem>
  );
}

function UiEditorSubNav() {
  return (
    <>
      <FileMenu />
      <EcoSysButton />
      {/* <UiEditButton /> */}
      {/* <TerminalButton /> */}
      {/* <Spacer /> */}
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

function LoggedOutNav() {
  return (
    <>
      <Link to="/">Login</Link>
      <Link to="/signup">Sign Up</Link>
    </>
  );
}
