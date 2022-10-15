import { Text } from "@chakra-ui/react";
import { logout } from "dbRequests/authentication.js";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useEffect } from "react";
import { useHistory } from "react-router-dom";
import { resetEntireState } from "store/store";

export default function LogoutPage() {
  const actionLoginFail = useStoreActions((actions) => actions.auth.loginFail);
  const access_token = useStoreState((state) => state.auth.access_token);
  let history = useHistory();

  useEffect(() => {
    console.log("LogoutPage useEffect");
    history.push("/");
    logout({ actionLoginFail, access_token });
    resetEntireState();
  }, []);

  return <Text>Logging out...</Text>;
}
