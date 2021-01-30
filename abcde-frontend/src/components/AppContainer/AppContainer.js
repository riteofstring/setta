import React from "react";
import { Flex, HStack, Heading } from "@chakra-ui/react";
import SwitchContainer from "./SwitchContainer/SwitchContainer";
import { Link, BrowserRouter } from "react-router-dom";
import { useStoreState } from "easy-peasy";

const AppContainer = () => {
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);

  const authLinks = () => {
    return (
      <>
        {/* <Link to="/start">Start</Link> */}
        <Link to="/developer">Dev</Link>
        <Link to="/ui">UI</Link>
        <Link to="/terminal">Terminal</Link>
        <Link to="/logout">Logout</Link>
      </>
    );
  };

  const notAuthLinks = () => {
    return (
      <>
        <Link to="/">Login</Link>
        <Link to="/signup">Sign Up</Link>
      </>
    );
  };

  return (
    <BrowserRouter>
      <Flex align="center" justify="center">
        <HStack
          as="nav"
          position="fixed"
          top="0"
          spacing={10}
          align="stretch"
          bg="gray.50"
          width="100vw"
          px="5rem"
          py="2.5rem"
          mb="2.5rem"
          zIndex={100}
        >
          <Heading fontSize="lg" color="gray.500" mr="1rem">
            ABCDE
          </Heading>
          {isAuthenticated ? authLinks() : notAuthLinks()}
        </HStack>
        <SwitchContainer isAuthenticated={isAuthenticated} />
      </Flex>
    </BrowserRouter>
  );
};

export default React.memo(AppContainer);
