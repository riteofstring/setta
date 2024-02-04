import { useLoadProject } from "hooks/useProject";
import { useEffect } from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import { useStoreApi } from "xyflow/core";
import { GridWrapper } from "../../../utils/Wrappers/GridWrapper";
import { UIPage } from "../../UI/UiPage";
import { Overview } from "./UiEditorContainer/SidePanes/Overview/Overview";
import { UiEditor } from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export function MainContainer() {
  const doneLoading = useLoadProject();

  useInitGlobalReactFlowStore();

  return (
    doneLoading && (
      <>
        <Overview />
        <UiEditor />
        <GridWrapper>
          <UIPage />
        </GridWrapper>
      </>
    )
  );
}

function useInitGlobalReactFlowStore() {
  const store = useStoreApi();
  useEffect(() => {
    REACT_FLOW_STORE.store = store;
  }, []);
}
