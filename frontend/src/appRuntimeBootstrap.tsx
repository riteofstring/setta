import type { CreateAppRouterArgs } from "components/Pages/router";
import type { AppProps } from "./App";
import { buildBootstrapAppProps } from "./appBootstrap";

export function buildRuntimeBootstrapAppProps({
  SectionBoundary,
  renderDictArea,
}: CreateAppRouterArgs): AppProps {
  return buildBootstrapAppProps({
    SectionBoundary,
    renderDictArea,
  });
}
