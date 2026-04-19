import { ProjectChatBottomDock } from "components/ChatWindowing/ProjectChatBottomDock";
import { GitOverlayLayer } from "components/Git/GitOverlayLayer";
import { Overview } from "components/Panes/Overview/Overview";
import { UiEditor } from "components/Panes/UiEditor/UiEditor";
import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { FloatingBox } from "components/Utils/FloatingBox";
import { GridWrapper } from "components/Utils/GridWrapper";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import {
  DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST,
  useAppSubsystemPreviewEnabled,
  useAppSubsystemPreviewSurface,
} from "plugins/appSubsystem";
import {
  AppSubsystemRendererHost,
  EMPTY_APP_SUBSYSTEM_RENDERER_PROPS,
} from "plugins/appSubsystemRendererHost";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import {
  useAIFollowViewport,
  useAIFollowZIndexBoost,
} from "state/hooks/aiFollow";
import { useViewModeUrlSync } from "state/hooks/viewModeUrl";
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
  const isAppPreviewEnabled = useAppSubsystemPreviewEnabled();
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

  return (
    <>
      <Overview />
      <UiEditor />
      <GridWrapper>
        {isAppPreviewEnabled && appPreviewSurface ? (
          <AppSubsystemRendererHost
            renderer={appPreviewSurface.renderer}
            props={EMPTY_APP_SUBSYSTEM_RENDERER_PROPS}
            host={DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST}
            className="h-full w-full"
            testId="app-subsystem-preview-surface"
          />
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
