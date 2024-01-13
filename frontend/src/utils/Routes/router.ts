import { createBrowserRouter } from "react-router-dom";
import { indexRoute } from "./indexRoute";
import { projectRoute } from "./project";
import { settingsRoute } from "./settings";
import { TerminalRoute } from "./TerminalRouter";

export const router = createBrowserRouter([
  indexRoute,
  projectRoute,
  settingsRoute,
  TerminalRoute,
]);
