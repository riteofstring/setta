import { useLoadProject } from "hooks/useProject";
import { useLocation, useParams } from "react-router-dom";
import { GridWrapper } from "../../../utils/Wrappers/GridWrapper";
import { UIPage } from "../../UI/UiPage";
import { Overview } from "./UiEditorContainer/SidePanes/Overview/Overview";
import { UiEditor } from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export function MainContainer() {
  const { projectName, configName } = useParams();
  const { state } = useLocation();
  const doneLoading = useLoadProject({
    projectName,
    configName,
    ...state,
  });

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
