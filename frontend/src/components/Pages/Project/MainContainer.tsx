import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { FloatingBox } from "components/Utils/FloatingBox";
import { GridWrapper } from "components/Utils/GridWrapper";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { useEffect } from "react";
import { initializeGlobalSectionColumnWidthEventListeners } from "state/actions/sectionColumnWidth";
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

  useEffect(() => {
    if (doneLoading && !is404) {
      const cleanup = initializeGlobalSectionColumnWidthEventListeners();
      return cleanup;
    }
  }, [doneLoading, is404]);

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
