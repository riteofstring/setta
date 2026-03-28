import "@fontsource/cormorant-garamond/700-italic.css";
import "@fontsource/inter";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "@fontsource/source-code-pro/500.css";
import "@fontsource/work-sans";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "@fontsource/work-sans/700.css";
import { createAppRouter } from "components/Pages/router";
import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { createElement } from "react";
import { RouterProvider } from "react-router-dom";

function renderStandaloneProjectSurfaceRouteDictArea(
  props: SectionContainerAreaDictProps,
) {
  return createElement(SectionContainerAreaDictBoundary, props);
}

const router = createAppRouter({
  renderDictArea: renderStandaloneProjectSurfaceRouteDictArea,
});

export function App() {
  return <RouterProvider router={router} />;
}
