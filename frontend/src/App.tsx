import "@fontsource/cormorant-garamond/700-italic.css";
import "@fontsource/inter";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "@fontsource/source-code-pro/500.css";
import "@fontsource/work-sans";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "@fontsource/work-sans/700.css";
import {
  createAppRouter,
  type CreateAppRouterArgs,
} from "components/Pages/router";
import { RouterProvider, type RouterProviderProps } from "react-router-dom";

export type AppProps = {
  router: RouterProviderProps["router"];
};

type BuildAppPropsInput = Pick<
  CreateAppRouterArgs,
  "SectionBoundary" | "renderDictArea"
>;

export function buildAppProps({
  SectionBoundary,
  renderDictArea,
}: BuildAppPropsInput): AppProps {
  return {
    router: createAppRouter({
      SectionBoundary,
      renderDictArea,
    }),
  };
}

export function App({ router }: AppProps) {
  return <RouterProvider router={router} />;
}
