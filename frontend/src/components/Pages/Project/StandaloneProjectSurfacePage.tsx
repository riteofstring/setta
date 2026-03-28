import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import { useNavigate, useParams } from "react-router-dom";
import { useLoadProjectConfig } from "state/hooks/project";
import { StandaloneProjectSurfacePageTargetBoundary } from "./StandaloneProjectSurfacePageTargetBoundary";

type StandaloneProjectSurfacePageLoadState = {
  doneLoading: boolean;
  is404: boolean;
};

export function StandaloneProjectSurfacePage() {
  const [doneLoading, is404] = useLoadProjectConfig();
  return (
    <StandaloneProjectSurfacePageWithLoadState
      doneLoading={doneLoading === true}
      is404={is404 === true}
    />
  );
}

export function StandaloneProjectSurfacePageWithLoadState({
  doneLoading,
  is404,
}: StandaloneProjectSurfacePageLoadState) {
  const { projectConfigName, sectionSlug, chatId, windowSpaceSlug } =
    useParams();
  const navigate = useNavigate();
  const resolvedDoneLoading = doneLoading === true;
  const resolvedIs404 = is404 === true;

  useCodeMirrorStyleLoader(resolvedDoneLoading, resolvedIs404);
  useAddMouseLocationListener();
  usePluginRuntimeBootstrap(resolvedDoneLoading && !resolvedIs404);

  return (
    <StandaloneProjectSurfacePageTargetBoundary
      doneLoading={resolvedDoneLoading}
      is404={resolvedIs404}
      projectConfigName={projectConfigName}
      sectionSlug={sectionSlug}
      chatId={chatId}
      windowSpaceSlug={windowSpaceSlug}
      navigate={navigate}
    />
  );
}
