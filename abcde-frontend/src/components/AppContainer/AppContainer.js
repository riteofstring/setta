import React from "react";
import { Flex, HStack, Heading } from "@chakra-ui/react";
import SwitchContainer from "./SwitchContainer/SwitchContainer";
import { Link } from "react-router-dom";
const AppContainer = () => {
  return (
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
        <Link to="/login">Login</Link>
        <Link to="/signup">Sign Up</Link>
        <Link to="/start">Start</Link>
        <Link to="/developer">Dev</Link>
        <Link to="/">UI</Link>
        <Link to="/terminal">Terminal</Link>
      </HStack>
      <SwitchContainer />
    </Flex>
  );
};

export default React.memo(AppContainer);
