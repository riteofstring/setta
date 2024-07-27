import { useLoadProject } from "state/hooks/project";
import { GridWrapper } from "components/Utils/GridWrapper";
import { Overview } from "../../../components/Panes/Overview/Overview";
import { UiEditor } from "../../../components/Panes/UiEditor/UiEditor";
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
