import { Overview } from "components/Panes/Overview/Overview";
import { UiEditor } from "components/Panes/UiEditor/UiEditor";
import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { FloatingBox } from "components/Utils/FloatingBox";
import { GridWrapper } from "components/Utils/GridWrapper";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import {
  useAIFollowViewport,
  useAIFollowZIndexBoost,
} from "state/hooks/aiFollow";
import { useLoadShareDeployment } from "state/hooks/share";
import { LoadingSpinner } from "../LoadingSpinner";
import { NotFound } from "../NotFound/NotFound";
import { UIPage } from "../Project/UiPage";

export function ShareMainContainer() {
  const [doneLoading, is404] = useLoadShareDeployment();
  useCodeMirrorStyleLoader(doneLoading, is404);
  useAddMouseLocationListener();
  useAIFollowViewport();
  useAIFollowZIndexBoost();

  return !doneLoading ? (
    <LoadingSpinner />
  ) : is404 ? (
    <NotFound />
  ) : (
    <>
      <Overview />
      <UiEditor />
      <GridWrapper>
        <UIPage />
      </GridWrapper>
      <FloatingBox />
    </>
  );
}
