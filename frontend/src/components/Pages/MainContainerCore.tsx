import { ProjectChatBottomDock } from "components/ChatWindowing/ProjectChatBottomDock";
import { GitOverlayLayer } from "components/Git/GitOverlayLayer";
import { Overview } from "components/Panes/Overview/Overview";
import { UiEditor } from "components/Panes/UiEditor/UiEditor";
import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { FloatingBox } from "components/Utils/FloatingBox";
import { GridWrapper } from "components/Utils/GridWrapper";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import { useAppPreview } from "state/definitions";
import {
  useAIFollowViewport,
  useAIFollowZIndexBoost,
} from "state/hooks/aiFollow";
import { useViewModeUrlSync } from "state/hooks/viewModeUrl";
import { NotFound } from "./NotFound/NotFound";
import { AppPreview } from "./Project/AppPreview";
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
  useCodeMirrorStyleLoader(doneLoading, is404);
  useAddMouseLocationListener();
  useAIFollowViewport();
  useAIFollowZIndexBoost();
  useViewModeUrlSync({ enabled: doneLoading && !is404 });
  usePluginRuntimeBootstrap(doneLoading && !is404);

  if (!doneLoading) {
    return <ProjectSurfaceLoadingState />;
  }

  if (is404) {
    return <NotFound />;
  }

  return (
    <>
      <Overview />
      <UiEditor />
      <GridWrapper>
        {isAppPreviewEnabled ? <AppPreview /> : <UIPage />}
      </GridWrapper>
      <ProjectChatBottomDock />
      <ViewModeTabs />
      <GitOverlayLayer />
      <FloatingBox />
    </>
  );
}

function ProjectSurfaceLoadingState() {
  return (
    <section
      className="flex h-full min-h-0 w-full items-center justify-center"
      data-testid="project-surface-loading-state"
    >
      <div className="flex flex-col items-center gap-3 text-center text-xs text-setta-500 dark:text-setta-200">
        <div className="gg-spinner !scale-150 before:!border-t-blue-500 after:!border-blue-500" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-setta-700 dark:text-setta-100">
            Loading project...
          </p>
          <p>Waiting for project data to load.</p>
        </div>
      </div>
    </section>
  );
}
