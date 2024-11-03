import { useCodeMirrorStyleLoader } from "components/utils/CodeMirror/useCodeMirrorStyleLoader";
import { GridWrapper } from "components/Utils/GridWrapper";
import C from "constants/constants.json";
import { useEffect } from "react";
import { dbRequestTypeCheck } from "requests/sections";
import { dbGetExistingTerminals } from "requests/terminals";
import {
  addChild,
  addSectionInEmptySpace,
} from "state/actions/sections/createSections";
import {
  useProjectConfig,
  useSectionInfos,
  useSettings,
} from "state/definitions";
import { useLoadProjectConfig } from "state/hooks/project";
import { Overview } from "../../../components/Panes/Overview/Overview";
import { UiEditor } from "../../../components/Panes/UiEditor/UiEditor";
import { UIPage } from "./UiPage";

export function MainContainer() {
  const doneLoading = useLoadProjectConfig();
  useCodeMirrorStyleLoader(doneLoading);

  useEffect(() => {
    async function fn() {
      if (doneLoading) {
        dbRequestTypeCheck();
        const res = await dbGetExistingTerminals(
          useProjectConfig.getState().id,
        );
        if (res.status === 200) {
          const existingTerminalIds = res.data;
          const terminalsWithoutSections = existingTerminalIds.filter(
            (x) => !(x in useSectionInfos.getState().x),
          );
          if (terminalsWithoutSections.length === 0) {
            return;
          }
          const groupId = addSectionInEmptySpace({
            type: C.DECK,
            inputSectionProps: { name: "Restored Temporary Terminals" },
          });
          for (const tid of terminalsWithoutSections) {
            addChild({
              id: tid,
              parentId: groupId,
              type: C.TERMINAL,
              sectionProps: {
                size: useSettings.getState().defaultTerminalSectionSize,
              },
            });
          }
        }
      }
    }
    fn();
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
