import SignUpPage from "components/SignUpPage/SignUpPage";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect } from "react";
import { LOGIN, SIGN_UP, UI } from "utils/pageNames";
// import HomePage from "../../HomePage";
import LoginPage from "../../LoginPage/LoginPage";
// import SignUpPage from "../../SignUpPage/SignUpPage";
import MainContainer from "../Main/MainContainer";

const SwitchContainer = () => {
  const isAuthenticated = useStoreState((x) => x.auth.isAuthenticated);
  const currPage = useStoreState((x) => x.currPage.name);
  const setCurrPage = useStoreActions((x) => x.currPage.setName);

  function getPage() {
    if (isAuthenticated) {
      return <MainContainer />;
    } else {
      if (currPage === LOGIN) {
        return <LoginPage />;
      } else if (currPage === SIGN_UP) {
        return <SignUpPage />;
      }
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      setCurrPage(UI);
    } else {
      setCurrPage(LOGIN);
    }
  }, [isAuthenticated]);

  return getPage();
};

export default React.memo(SwitchContainer);
