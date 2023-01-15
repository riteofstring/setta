import { useLoadProject } from "hooks/useProject";
import { useParams } from "react-router-dom";
import UIPage from "../../UI/UiPage";
import GridWrapper from "../GridWrapper/GridWrapper";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export default function MainContainer() {
  const { projectName, configName } = useParams();
  const doneLoading = useLoadProject(projectName, configName);

  return (
    doneLoading && (
      <>
        <Overview />
        <UiEditor />
        <GridWrapper>
          <div className="h-[inherit] overflow-hidden flex-1 min-h-0 min-w-0">
            <UIPage />
          </div>
        </GridWrapper>
      </>
    )
  );
}
