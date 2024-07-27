import { useLoadProject } from "state/hooks/project";
import { GridWrapper } from "../../Wrappers/GridWrapper";
import { Overview } from "../../../components/ProjectPage/Overview/Overview";
import { UiEditor } from "../../../components/ProjectPage/UiEditor/UiEditor";
import { UIPage } from "./UiPage";

export function MainContainer() {
  const doneLoading = useLoadProject();

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
