import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";
import { buildModeWrappedRouterArgs } from "./modeWrappedRouterArgs";

export const router = createModeWrappedBrowserRouter(buildModeWrappedRouterArgs());
