import { createBrowserRouter } from "react-router-dom";
import { communityRoute } from "./community";
import { indexRoute } from "./indexRoute";
import { projectRoute } from "./project";

export const router = createBrowserRouter([
  indexRoute,
  projectRoute,
  communityRoute,
]);
