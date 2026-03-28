import type { CreateAppRouterArgs } from "components/Pages/router";
import type { AppProps } from "./App";
import { buildAppProps } from "./App";

export function buildBootstrapAppProps({
  SectionBoundary,
  renderDictArea,
}: CreateAppRouterArgs): AppProps {
  return buildAppProps({
    SectionBoundary,
    renderDictArea,
  });
}
