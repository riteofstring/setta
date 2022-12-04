import { useProjectToLoad } from "hooks/useProject";
import UIPage from "../../UI/UiPage";
import GridWrapper from "../GridWrapper/GridWrapper";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";

export default function MainContainer() {
  const doneLoading = useProjectToLoad();

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
