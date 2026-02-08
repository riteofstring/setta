import { GitOverlayLayer } from "components/Git/GitOverlayLayer";
import { Overview } from "components/Panes/Overview/Overview";
import { UiEditor } from "components/Panes/UiEditor/UiEditor";
import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { FloatingBox } from "components/Utils/FloatingBox";
import { GridWrapper } from "components/Utils/GridWrapper";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { useAppPreview } from "state/definitions";
import {
  useAIFollowViewport,
  useAIFollowZIndexBoost,
} from "state/hooks/aiFollow";
import { useViewModeUrlSync } from "state/hooks/viewModeUrl";
import { LoadingSpinner } from "./LoadingSpinner";
import { NotFound } from "./NotFound/NotFound";
import { AppPreview } from "./Project/AppPreview";
import { UIPage } from "./Project/UiPage";

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
        {isAppPreviewEnabled ? <AppPreview /> : <UIPage />}
      </GridWrapper>
      <GitOverlayLayer />
      <FloatingBox />
    </>
  );
}
