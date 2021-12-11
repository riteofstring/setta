import { Text } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect } from "react";
import { useHistory } from "react-router-dom";

import { logout } from "../../dbRequests/authentication.js";
import { resetEntireState } from "../../store/store";

export default function LogoutPage() {
  const actionLoginFail = useStoreActions((actions) => actions.auth.loginFail);
  const authToken = useStoreState((state) => state.auth.token);
  let history = useHistory();

  useEffect(() => {
    console.log("LogoutPage useEffect");
    history.push("/");
    logout({ actionLoginFail, authToken });
    resetEntireState();
  }, []);

  return <Text>Logging out...</Text>;
}
