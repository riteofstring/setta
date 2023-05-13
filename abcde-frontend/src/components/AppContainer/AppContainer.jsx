import { RouterProvider } from "react-router-dom";
import { router } from "utils/Routes/router";

export const AppContainer = () => {
  return <RouterProvider router={router} />;
};
