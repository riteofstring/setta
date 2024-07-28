import { GridWrapper } from "components/Utils/GridWrapper";
import { useLoadProject } from "state/hooks/project";
import { Overview } from "../../../components/Panes/Overview/Overview";
import { UiEditor } from "../../../components/Panes/UiEditor/UiEditor";
import { UIPage } from "./UiPage";

export function MainContainer() {
  return (
    <>
      <LoadingSpinner />
      <Overview />
      <UiEditor />
      <GridWrapper>
        <UIPage />
      </GridWrapper>
    </>
  );
}

function LoadingSpinner({ children }) {
  const doneLoading = useLoadProject();
  console.log("doneLoading", doneLoading)

  return !doneLoading ? (
    <div className="single-cell-container absolute h-full w-full">
      <div
        className={`single-cell-child inset-0 place-self-center bg-transparent bg-opacity-50`}
      >
        <div className="loader h-16 w-16 animate-spin rounded-full border-t-4 border-solid border-blue-500"></div>
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  ) : (
    children
  );
}
