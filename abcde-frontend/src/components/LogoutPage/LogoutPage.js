import React, { useEffect } from "react";
import { logout } from "../../dbRequests/authentication.js";
import { useStoreActions, useStoreState } from "easy-peasy";
import { resetEntireState } from "../../store/store";
import { useHistory } from "react-router-dom";

const LogoutPage = () => {
  const actionLoginFail = useStoreActions((actions) => actions.auth.loginFail);
  const authToken = useStoreState((state) => state.auth.token);
  resetEntireState();
  logout({ actionLoginFail, authToken });
  let history = useHistory();

  useEffect(() => {
    history.push("/");
  }, []);

  return null;
};

export default React.memo(LogoutPage);
