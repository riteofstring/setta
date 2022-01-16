import { Flex, HStack, Divider } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import { useLocation, Link } from "react-router-dom";

import EcoSysButton from "./EcoSysButton/EcoSysButton";
import EnvSelectButton from "./EnvSelect/EnvSelectButton";
import FileMenu from "./FileMenu/FileMenu";
import RunButton from "./RunButton/RunButton";
import SelectMachine from "./SelectMachine/SelectMachine";

export default function SubNav() {
  return (
    <Flex>
      <HStack spacing={2}>
        <Divider orientation="vertical" pr=".5rem" />
        <NavSwitch />
      </HStack>
    </Flex>
  );
}

function NavSwitch() {
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);
  const location = useLocation();

  if (isAuthenticated) {
    switch (location.pathname) {
      case "/":
        return <UiEditorSubNav />;
      case "/home":
        return <HomePageSubNav />;
      case "/logout":
        return <LoggedOutNav />;
    }
  }
  return <></>;
}

function UiEditorSubNav() {
  return (
    <>
      {/* <HomeButton /> */}
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

function HomePageSubNav() {
  return <>{/* <HomeButton /> */}</>;
}

function LoggedOutNav() {
  return (
    <>
      <Link to="/">Login</Link>
      <Link to="/signup">Sign Up</Link>
    </>
  );
}
