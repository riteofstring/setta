import { useLoadProject } from "state/hooks/project";
import { GridWrapper } from "../../utils/Wrappers/GridWrapper";
import { Overview } from "./Overview/Overview";
import { UiEditor } from "./UiEditor/UiEditor";
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
