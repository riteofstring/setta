import { GridWrapper } from "components/Utils/GridWrapper";
import { useLoadProject } from "state/hooks/project";
import { Overview } from "../../../components/Panes/Overview/Overview";
import { UiEditor } from "../../../components/Panes/UiEditor/UiEditor";
import { UIPage } from "./UiPage";

export function MainContainer() {
  return (
    <LoadingSpinner>
      <Overview />
      <UiEditor />
      <GridWrapper>
        <UIPage />
      </GridWrapper>
    </LoadingSpinner>
  );
}

function LoadingSpinner({ children }) {
  const doneLoading = useLoadProject();

  return !doneLoading ? (
    <div className="relative h-full w-full">
      <div
        className={`absolute inset-0 block flex items-center justify-center bg-black bg-opacity-50`}
      >
        <div className="loader h-16 w-16 animate-spin rounded-full border-t-4 border-solid border-blue-500"></div>
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  ) : (
    children
  );
}
