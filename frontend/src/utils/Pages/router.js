import { createBrowserRouter } from "react-router-dom";
import { homeRoute } from "./home";
import { projectRoute } from "./project";
import { settingsRoute } from "./settings";

export const router = createBrowserRouter([
  homeRoute,
  projectRoute,
  settingsRoute,
]);
