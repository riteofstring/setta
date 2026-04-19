import { ProjectChatBottomDock } from "components/ChatWindowing/ProjectChatBottomDock";
import { GitOverlayLayer } from "components/Git/GitOverlayLayer";
import { Overview } from "components/Panes/Overview/Overview";
import { UiEditor } from "components/Panes/UiEditor/UiEditor";
import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { FloatingBox } from "components/Utils/FloatingBox";
import { GridWrapper } from "components/Utils/GridWrapper";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { useAppSubsystemPreviewSurface } from "plugins/appSubsystemRuntime";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import {
  useAIFollowViewport,
  useAIFollowZIndexBoost,
} from "state/hooks/aiFollow";
import { useViewModeUrlSync } from "state/hooks/viewModeUrl";
import { useAppPreview } from "../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemProjectState";
import { LoadingSpinner } from "./LoadingSpinner";
import { NotFound } from "./NotFound/NotFound";
import { UIPage } from "./Project/UiPage";
import { ViewModeTabs } from "./Project/ViewModeTabs";

type MainContainerCoreProps = {
  doneLoading: boolean;
  is404: boolean;
};

export function MainContainerCore({
  doneLoading,
  is404,
}: MainContainerCoreProps) {
  const isAppPreviewEnabled = useAppPreview((x) => x.isPreviewEnabled);
  const appPreviewSurface = useAppSubsystemPreviewSurface();
  useCodeMirrorStyleLoader(doneLoading, is404);
  useAddMouseLocationListener();
  useAIFollowViewport();
  useAIFollowZIndexBoost();
  useViewModeUrlSync({ enabled: doneLoading && !is404 });
  usePluginRuntimeBootstrap(doneLoading && !is404);

  if (!doneLoading) {
    return <LoadingSpinner />;
  }

  if (is404) {
    return <NotFound />;
  }

  const AppPreviewComponent = appPreviewSurface?.component;

  return (
    <>
      <Overview />
      <UiEditor />
      <GridWrapper>
        {isAppPreviewEnabled && AppPreviewComponent ? (
          <AppPreviewComponent />
        ) : (
          <UIPage />
        )}
      </GridWrapper>
      <ProjectChatBottomDock />
      <ViewModeTabs />
      <GitOverlayLayer />
      <FloatingBox />
    </>
  );
}
