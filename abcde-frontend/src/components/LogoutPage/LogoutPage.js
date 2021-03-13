import React from "react";
import { logout } from "../../dbRequests/authentication.js";
import { useStoreActions, useStoreState } from "easy-peasy";

const LogoutPage = () => {
  const actionLoginFail = useStoreActions((actions) => actions.auth.loginFail);
  const authToken = useStoreState((state) => state.auth.token);
  const cliSocket = useStoreState((state) => state.cliSocket.cliSocket);
  cliSocket.close()
  logout({ actionLoginFail, authToken })
  return null;
};

export default React.memo(LogoutPage);
