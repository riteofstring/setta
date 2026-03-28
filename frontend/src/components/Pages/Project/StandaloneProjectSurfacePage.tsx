import type { ComponentProps } from "react";
import {
  StandaloneProjectSurfacePageLoadBoundary,
  StandaloneProjectSurfacePageWithLoadState,
} from "./StandaloneProjectSurfacePageLoadBoundary";

type StandaloneProjectSurfacePageProps = Pick<
  ComponentProps<typeof StandaloneProjectSurfacePageLoadBoundary>,
  "renderDictArea"
>;

export function StandaloneProjectSurfacePage({
  renderDictArea,
}: StandaloneProjectSurfacePageProps) {
  return (
    <StandaloneProjectSurfacePageLoadBoundary renderDictArea={renderDictArea} />
  );
}

export { StandaloneProjectSurfacePageWithLoadState };
