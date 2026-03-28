import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import { memo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLoadProjectConfig } from "state/hooks/project";
import { StandaloneProjectSurfacePageTargetBoundary } from "./StandaloneProjectSurfacePageTargetBoundary";

export type StandaloneProjectSurfacePageLoadState = {
  doneLoading: boolean;
  is404: boolean;
};

function _StandaloneProjectSurfacePageWithLoadState({
  doneLoading,
  is404,
}: StandaloneProjectSurfacePageLoadState) {
  const { projectConfigName, sectionSlug, chatId, windowSpaceSlug } =
    useParams();
  const navigate = useNavigate();

  useCodeMirrorStyleLoader(doneLoading, is404);
  useAddMouseLocationListener();
  usePluginRuntimeBootstrap(doneLoading && !is404);

  return (
    <StandaloneProjectSurfacePageTargetBoundary
      doneLoading={doneLoading}
      is404={is404}
      projectConfigName={projectConfigName}
      sectionSlug={sectionSlug}
      chatId={chatId}
      windowSpaceSlug={windowSpaceSlug}
      navigate={navigate}
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
