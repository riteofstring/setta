import { useCodeMirrorStyleLoader } from "components/utils/CodeMirror/useCodeMirrorStyleLoader";
import { GridWrapper } from "components/Utils/GridWrapper";
import { useEffect } from "react";
import { dbRequestTypeCheck } from "requests/sections";
import { useLoadProjectConfig } from "state/hooks/project";
import { restoreTerminals } from "state/hooks/terminal";
import { Overview } from "../../../components/Panes/Overview/Overview";
import { UiEditor } from "../../../components/Panes/UiEditor/UiEditor";
import { UIPage } from "./UiPage";

export function MainContainer() {
  const doneLoading = useLoadProjectConfig();
  useCodeMirrorStyleLoader(doneLoading);

  useEffect(() => {
    if (doneLoading) {
      dbRequestTypeCheck();
      restoreTerminals();
    }
  }, [doneLoading]);

  return (
    <>
      {!doneLoading && <LoadingSpinner doneLoading={doneLoading} />}
      <Overview />
      <UiEditor />
      <GridWrapper>{doneLoading && <UIPage />}</GridWrapper>
    </>
  );
}

function LoadingSpinner() {
  return (
    <div className="single-cell-container absolute h-full w-full">
      <div
        className={`single-cell-child inset-0 place-self-center bg-transparent bg-opacity-50`}
      >
        <div className="gg-spinner !scale-150 before:!border-t-blue-500 after:!border-blue-500"></div>
      </div>
      <div className="relative z-10" />
    </div>
  );
}
