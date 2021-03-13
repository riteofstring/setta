import React from "react";
import { logout } from "../../dbRequests/authentication.js";
import { useStoreActions, useStoreState } from "easy-peasy";

const LogoutPage = () => {
  const actionLoginFail = useStoreActions((actions) => actions.auth.loginFail);
  const resetSections = useStoreActions((actions) => actions.master.resetSections);
  const resetGlobalCurr = useStoreActions((actions) => actions.globalCurr.resetGlobalCurr);
  const resetCLISocket = useStoreActions((actions) => actions.cliSocket.resetCLISocket);
  const authToken = useStoreState((state) => state.auth.token);
  // need to have a global state reset instead of this shit
  resetSections()
  resetGlobalCurr()
  resetCLISocket()
  logout({ actionLoginFail, authToken })
  return null;
};

export default React.memo(LogoutPage);
