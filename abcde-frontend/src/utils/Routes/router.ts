import { createBrowserRouter } from "react-router-dom";
import { indexRoute } from "./indexRoute";
import { projectRoute } from "./project";
import { signUpRoute } from "./signUp";

export const router = createBrowserRouter([
  indexRoute,
  signUpRoute,
  projectRoute,
]);
