import { Divider, Flex, HStack } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";

import EcoSysButton from "./EcoSysButton/EcoSysButton";
import FileMenu from "./FileMenu/FileMenu";
import RunButton from "./RunButton/RunButton";
import UiConfigButton from "./UiConfigButton/UiConfigButton";

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

  if (isAuthenticated) {
    // switch (location.pathname) {
    //   case "/":
    //     return <UiEditorSubNav />;
    //   case "/home":
    //     return <HomePageSubNav />;
    //   case "/logout":
    //     return <LoggedOutNav />;
    // }
  }
  return <></>;
}

function UiEditorSubNav() {
  return (
    <>
      <FileMenu />
      <EcoSysButton />
      <UiConfigButton />
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
      {/* <Link to="/">Login</Link>
      <Link to="/signup">Sign Up</Link> */}
    </>
  );
}
