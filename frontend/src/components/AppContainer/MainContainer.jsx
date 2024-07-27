import { useLoadProject } from "state/hooks/project";
import { GridWrapper } from "../../utils/Wrappers/GridWrapper";
import { UIPage } from "../UI/UiPage";
import { Overview } from "./Overview/Overview";
import { UiEditor } from "./UiEditor/UiEditor";

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
