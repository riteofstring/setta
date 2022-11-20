import { accessPage, logout } from "dbRequests/authentication";
import { useStoreActions, useStoreState } from "easy-peasy";

export function useAccessPage() {
  const access_token = useStoreState((x) => x.auth.access_token);
  const actionStayLoggedIn = useStoreActions((x) => x.auth.stayLoggedIn);
  const actionLoginFail = useStoreActions((x) => x.auth.loginFail);
  return ({ address }) => {
    accessPage({
      address,
      access_token,
      actionStayLoggedIn,
      actionLoginFail,
    });
  };
}

export function useLogout() {
  const access_token = useStoreState((x) => x.auth.access_token);
  const actionLoginFail = useStoreActions((x) => x.auth.loginFail);

  return () => {
    logout({ actionLoginFail, access_token });
  };
}
