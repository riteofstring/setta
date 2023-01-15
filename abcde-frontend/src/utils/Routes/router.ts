import { createReactRouter } from "@tanstack/react-router";
import { indexRoute } from ".";
import { rootRoute } from "./root";
import { signUpRoute } from "./signup";

const routeConfig = rootRoute.addChildren([indexRoute, signUpRoute]);

export const router = createReactRouter({ routeConfig });
