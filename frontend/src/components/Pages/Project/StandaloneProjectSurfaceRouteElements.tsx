import { memo } from "react";
import type { ModeRouteElements } from "../modeRouteResolver";
import {
  IdeStandaloneProjectSurfaceRouteBoundary,
  ShareStandaloneProjectSurfaceRouteBoundary,
  type StandaloneProjectSurfaceRouteElementBoundaryProps,
} from "./StandaloneProjectSurfaceRouteElementBoundary";

export type StandaloneProjectSurfaceRouteElementsArgs = Pick<
  ModeRouteElements,
  "app" | "launcher"
> &
  StandaloneProjectSurfaceRouteElementBoundaryProps;

function _IdeStandaloneProjectSurfaceRouteElement({
  renderDictArea,
}: StandaloneProjectSurfaceRouteElementBoundaryProps) {
  return (
    <IdeStandaloneProjectSurfaceRouteBoundary renderDictArea={renderDictArea} />
  );
}

export const IdeStandaloneProjectSurfaceRouteElement = memo(
  _IdeStandaloneProjectSurfaceRouteElement,
);

export function buildStandaloneProjectSurfaceRouteElements({
  app,
  launcher,
  renderDictArea,
}: StandaloneProjectSurfaceRouteElementsArgs): ModeRouteElements {
  return {
    ide: (
      <IdeStandaloneProjectSurfaceRouteElement
        renderDictArea={renderDictArea}
      />
    ),
    share: (
      <ShareStandaloneProjectSurfaceRouteBoundary
        renderDictArea={renderDictArea}
      />
    ),
    app,
    launcher,
  };
}
