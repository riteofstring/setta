import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { FloatingBox } from "components/Utils/FloatingBox";
import { GridWrapper } from "components/Utils/GridWrapper";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { useAIFollowViewport } from "state/hooks/aiFollow";
import { useLoadProjectConfig } from "state/hooks/project";
import { Overview } from "../../../components/Panes/Overview/Overview";
import { UiEditor } from "../../../components/Panes/UiEditor/UiEditor";
import { LoadingSpinner } from "../LoadingSpinner";
import { NotFound } from "../NotFound/NotFound";
import { UIPage } from "./UiPage";

export function MainContainer() {
  const [doneLoading, is404] = useLoadProjectConfig();
  useCodeMirrorStyleLoader(doneLoading, is404);
  useAddMouseLocationListener();
  useAIFollowViewport();

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
