import { useLoadProject } from "hooks/useProject";
import { useLocation, useParams } from "react-router-dom";
import { GridWrapper } from "../../../utils/Wrappers/GridWrapper";
import { UIPage } from "../../UI/UiPage";
import { Overview } from "./UiEditorContainer/SidePanes/Overview/Overview";
import { UiEditor } from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export function MainContainer() {
  const { username, projectName, configName } = useParams();
  const { newProjectConfig } = useLocation();
  const doneLoading = useLoadProject({
    username,
    projectName,
    configName,
    newProjectConfig,
  });

  return (
    doneLoading && (
      <>
        <Overview />
        <UiEditor />
        <GridWrapper>
          <div className="h-[inherit] min-h-0 min-w-0 flex-1 overflow-hidden">
            <UIPage />
          </div>
        </GridWrapper>
      </>
    )
  );
}
