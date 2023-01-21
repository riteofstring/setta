import { useOpenWebsocket } from "hooks/useConnectWebsocket";
import React from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "utils/Routes/router";

const AppContainer = () => {
  useOpenWebsocket();
  return <RouterProvider router={router} />;
};

export default React.memo(AppContainer);
