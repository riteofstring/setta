import { createBrowserRouter } from "react-router-dom";
import { communityRoute } from "./community";
import { indexRoute } from "./indexRoute";
import { projectRoute } from "./project";
import { signUpRoute } from "./signUp";

export const router = createBrowserRouter([
  indexRoute,
  signUpRoute,
  projectRoute,
  communityRoute
]);
