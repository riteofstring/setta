import "@fontsource/cormorant-garamond/700-italic.css";
import "@fontsource/inter";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "@fontsource/source-code-pro/500.css";
import "@fontsource/work-sans";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "@fontsource/work-sans/700.css";
import { RouterProvider, type RouterProviderProps } from "react-router-dom";

type AppProps = {
  router: RouterProviderProps["router"];
};

export function App({ router }: AppProps) {
  return <RouterProvider router={router} />;
}
