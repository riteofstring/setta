import { RouterProvider } from "@tanstack/react-router";
import React from "react";
import { router } from "utils/Routes/router";

const AppContainer = () => {
  return <RouterProvider router={router} />;
};

export default React.memo(AppContainer);
