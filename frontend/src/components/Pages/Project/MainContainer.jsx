import { GridWrapper } from "components/Utils/GridWrapper";
import { useEffect } from "react";
import { dbRequestTypeCheck } from "requests/sections";
import { useLoadProjectConfig } from "state/hooks/project";
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
  const doneLoading = useLoadProjectConfig();

  useEffect(() => {
    if (doneLoading) {
      dbRequestTypeCheck();
    }
  }, [doneLoading]);

  return !doneLoading ? (
    <div className="single-cell-container absolute h-full w-full">
      <div
        className={`single-cell-child inset-0 place-self-center bg-transparent bg-opacity-50`}
      >
        <div className="gg-spinner !scale-150 before:!border-t-blue-500 after:!border-blue-500"></div>
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  ) : (
    children
  );
}
