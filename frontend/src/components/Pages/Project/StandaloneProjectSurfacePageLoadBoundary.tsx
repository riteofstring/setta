import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import { memo } from "react";
import { useLoadProjectConfig } from "state/hooks/project";
import { StandaloneProjectSurfacePageRouteStateBoundary } from "./StandaloneProjectSurfacePageRouteStateBoundary";

export type StandaloneProjectSurfacePageLoadState = {
  doneLoading: boolean;
  is404: boolean;
};

function _StandaloneProjectSurfacePageWithLoadState({
  doneLoading,
  is404,
}: StandaloneProjectSurfacePageLoadState) {
  useCodeMirrorStyleLoader(doneLoading, is404);
  useAddMouseLocationListener();
  usePluginRuntimeBootstrap(doneLoading && !is404);

  return (
    <StandaloneProjectSurfacePageRouteStateBoundary
      doneLoading={doneLoading}
      is404={is404}
    />
  );
}

export const StandaloneProjectSurfacePageWithLoadState = memo(
  _StandaloneProjectSurfacePageWithLoadState,
);

function _StandaloneProjectSurfacePageLoadBoundary() {
  const [doneLoading, is404] = useLoadProjectConfig();

  return (
    <StandaloneProjectSurfacePageWithLoadState
      doneLoading={doneLoading === true}
      is404={is404 === true}
    />
  );
}

export const StandaloneProjectSurfacePageLoadBoundary = memo(
  _StandaloneProjectSurfacePageLoadBoundary,
);
