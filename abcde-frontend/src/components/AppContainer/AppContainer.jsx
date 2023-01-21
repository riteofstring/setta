import React from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "utils/Routes/router";

const AppContainer = () => {
  return <RouterProvider router={router} />;
};

export default React.memo(AppContainer);
