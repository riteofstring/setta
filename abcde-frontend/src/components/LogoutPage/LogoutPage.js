import React from "react";
import { logout } from "../../dbRequests/authentication.js";
import { useStoreActions, useStoreState } from "easy-peasy";

const LogoutPage = () => {
  const actionLoginFail = useStoreActions((actions) => actions.auth.loginFail);
  const authToken = useStoreState((state) => state.auth.token);
  logout({ actionLoginFail, authToken })
  return null;
};

export default React.memo(LogoutPage);
