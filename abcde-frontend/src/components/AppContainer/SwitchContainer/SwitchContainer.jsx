import HomePage from "components/HomePage/HomePage";
import SignUpPage from "components/SignUpPage/SignUpPage";
import { useAuth } from "models/auth";
import { useCurrPage } from "models/currPage";
import React, { useEffect } from "react";
import { NO_AUTH } from "utils/constants";
import { HOME, LOGIN, SIGN_UP, UI } from "utils/pageNames";
import LoginPage from "../../LoginPage/LoginPage";
import MainContainer from "../Main/MainContainer";

const SwitchContainer = () => {
  const isAuthenticated = useAuth((x) => x.isAuthenticated);
  const currPage = useCurrPage((x) => x.name);
  const setCurrPage = useCurrPage((x) => x.setName);

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
        setCurrPage(LOGIN);
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
