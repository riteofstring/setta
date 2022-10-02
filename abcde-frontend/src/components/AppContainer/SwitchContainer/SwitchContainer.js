import HomePage from "components/HomePage";
import SignUpPage from "components/SignUpPage/SignUpPage";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect } from "react";
import { NO_AUTH } from "utils/constants";
import { HOME, LOGIN, SIGN_UP, UI } from "utils/pageNames";
import LoginPage from "../../LoginPage/LoginPage";
import MainContainer from "../Main/MainContainer";

const SwitchContainer = () => {
  const isAuthenticated = useStoreState((x) => x.auth.isAuthenticated);
  const currPage = useStoreState((x) => x.currPage.name);
  const setCurrPage = useStoreActions((x) => x.currPage.setName);

  function getPage() {
    if (isAuthenticated) {
      if (currPage === UI) {
        return <MainContainer />;
      } else if (currPage === HOME) {
        return <HomePage />;
      }
    } else {
      if (currPage === LOGIN) {
        return <LoginPage />;
      } else if (currPage === SIGN_UP) {
        return <SignUpPage />;
      }
    }
    return <LoginPage />;
  }

  useEffect(() => {
    if (isAuthenticated) {
      if (NO_AUTH) {
        setCurrPage(HOME);
      } else {
        setCurrPage(HOME);
      }
    } else {
      setCurrPage(LOGIN);
    }
  }, [isAuthenticated]);

  return getPage();
};

export default React.memo(SwitchContainer);
