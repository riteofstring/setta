import React from "react";
import { Flex, HStack, Heading } from "@chakra-ui/react";
import SwitchContainer from "./SwitchContainer/SwitchContainer";
import { Link, BrowserRouter } from "react-router-dom";
import { useStoreState } from "easy-peasy";
// import HeaderContainer from "./Header/Header";
// import MainContainer from "./Main/MainContainer";

const AppContainer = () => {
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);

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
      {!isAuthenticated && (
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
            {notAuthLinks()}
          </HStack>
        </Flex>
      )}
      <SwitchContainer />
    </BrowserRouter>
  );
};

export default React.memo(AppContainer);
