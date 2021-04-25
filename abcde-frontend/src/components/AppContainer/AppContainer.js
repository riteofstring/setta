import React, { useEffect } from "react";
import { Flex, HStack, Heading } from "@chakra-ui/react";
import SwitchContainer from "./SwitchContainer/SwitchContainer";
import { Link, BrowserRouter } from "react-router-dom";
import { useStoreState, useStoreActions } from "easy-peasy";
import { verifyToken } from "../../dbRequests/authentication";
import { NO_AUTH } from "../../utils/constants";
// import HeaderContainer from "./Header/Header";
// import MainContainer from "./Main/MainContainer";

const AppContainer = () => {
  const isAuthenticated = useStoreState((state) => state.auth.isAuthenticated);
  const token = useStoreState((state) => state.auth.token);
  const loginFail = useStoreActions((action) => action.auth.loginFail);
  const stayLoggedIn = useStoreActions((action) => action.auth.stayLoggedIn);

  console.log("isAuthenticated", isAuthenticated);

  useEffect(() => {
    if (!NO_AUTH) {
      verifyToken({
        authToken: token,
        actionStayLoggedIn: stayLoggedIn,
        actionLoginFail: loginFail,
      });
    }
  }, []);

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
      <SwitchContainer isAuthenticated={isAuthenticated} />
    </BrowserRouter>
  );
};

export default React.memo(AppContainer);
