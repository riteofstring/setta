import React from "react";
import { logout } from "../../dbRequests/authentication.js";
import { useStoreActions, useStoreState } from "easy-peasy";
import { resetEntireState } from "../../store/store"

const LogoutPage = () => {
  const actionLoginFail = useStoreActions((actions) => actions.auth.loginFail);
  const authToken = useStoreState((state) => state.auth.token);
  resetEntireState()
  logout({ actionLoginFail, authToken })
  return null;
};

export default React.memo(LogoutPage);
