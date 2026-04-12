import { router } from "components/Pages/router";
import { RouterProvider } from "react-router-dom";

export function AppRouterProvider() {
  return <RouterProvider router={router} />;
}
