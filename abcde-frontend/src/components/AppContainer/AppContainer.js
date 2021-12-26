import { Grid, Flex, HStack, Heading } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";
import React, { useEffect } from "react";
import { Link, BrowserRouter } from "react-router-dom";

import { verifyToken } from "../../dbRequests/authentication";
import HeaderContainer from "./Header/Header";
import SwitchContainer from "./SwitchContainer/SwitchContainer";

// import HeaderContainer from "./Header/Header";
// import MainContainer from "./Main/MainContainer";

const AppContainer = () => {
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);
  const token = useStoreState((state) => state.auth.token);
  const loginFail = useStoreActions((action) => action.auth.loginFail);
  const stayLoggedIn = useStoreActions((action) => action.auth.stayLoggedIn);

  console.log("AppContainer isAuthenticated", isAuthenticated);

  useEffect(() => {
    verifyToken({
      authToken: token,
      actionStayLoggedIn: stayLoggedIn,
      actionLoginFail: loginFail,
    });
  }, []);

  return (
    <BrowserRouter>
      <HeaderContainer />
      <Grid
        h="100%"
        w="100vw"
        border="1px"
        overflow="hidden"
        templateRows="min-content 1fr"
        templateColumns="1fr"
        borderColor="gray.200"
      >
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
                ABCDE 2
              </Heading>
              <NotAuthLinks />
            </HStack>
          </Flex>
        )}
        <SwitchContainer isAuthenticated={isAuthenticated} />
      </Grid>
    </BrowserRouter>
  );
};

export default React.memo(AppContainer);

function NotAuthLinks() {
  return (
    <>
      <Link to="/">Login</Link>
      <Link to="/signup">Sign Up</Link>
    </>
  );
}
