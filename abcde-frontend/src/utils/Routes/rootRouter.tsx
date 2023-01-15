import { createReactRouter, createRouteConfig } from "@tanstack/react-router";
import LoginPage from "components/LoginPage/LoginPage";
import { GridContainer } from "utils/atoms/gridContainer/GridContainer";

const rootRoute = createRouteConfig();

export const indexRoute = rootRoute.createRoute({
  path: "/",
  component: () => (
    <GridContainer>
      <LoginPage />
    </GridContainer>
  ),
});

const routeConfig = rootRoute.addChildren([indexRoute]);

export const router = createReactRouter({ routeConfig });
