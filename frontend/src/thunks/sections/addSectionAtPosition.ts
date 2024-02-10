import { maybeIncrementProjectStateVersion } from "thunks/undo";
import {
  CODE,
  CODE_UI_TYPE_ID,
  DECK,
  DECK_UI_TYPE_ID,
  GLOBAL_PARAM_SWEEP,
  GLOBAL_PARAM_SWEEP_UI_TYPE_ID,
  GLOBAL_VARIABLES,
  GLOBAL_VARIABLES_UI_TYPE_ID,
  SCRIPT,
  SCRIPT_UI_TYPE_ID,
  TERMINAL,
  TERMINAL_UI_TYPE_ID,
  VAR_CONTROL,
  VAR_CONTROL_UI_TYPE_ID,
} from "z_utils/constants";
import { newSectionInfo } from "z_utils/objs/sectionInfo";
import { createSectionInfo } from "./createSectionInfo";

type callbackBeforeExitType = (newId: string) => void;

export function addSectionAtPosition({
  type,
  callbackBeforeExit = () => undefined,
  incrementVersion = false,
  inputSectionProps = {},
  position,
}: {
  type: string;
  callbackBeforeExit?: callbackBeforeExitType;
  incrementVersion?: boolean;
  inputSectionProps: any;
}) {
  const sectionProps: Partial<Parameters<typeof newSectionInfo>[0]> = {
    ...inputSectionProps,
  };
  if (type === DECK) {
    sectionProps.name = "Group";
    sectionProps.uiTypeId = DECK_UI_TYPE_ID;
  } else if (type === GLOBAL_VARIABLES) {
    sectionProps.name = "Global Variables";
    sectionProps.uiTypeId = GLOBAL_VARIABLES_UI_TYPE_ID;
  } else if (type === SCRIPT) {
    sectionProps.name = "Script";
    sectionProps.uiTypeId = SCRIPT_UI_TYPE_ID;
  } else if (type === CODE) {
    sectionProps.name = "Code";
    sectionProps.uiTypeId = CODE_UI_TYPE_ID;
  } else if (type === VAR_CONTROL) {
    sectionProps.name = "Var Control";
    sectionProps.uiTypeId = VAR_CONTROL_UI_TYPE_ID;
  } else if (type === TERMINAL) {
    sectionProps.uiTypeId = TERMINAL_UI_TYPE_ID;
  } else if (type === GLOBAL_PARAM_SWEEP) {
    sectionProps.uiTypeId = GLOBAL_PARAM_SWEEP_UI_TYPE_ID;
  }
  const [newId] = createSectionInfo({ sectionProps, position });
  callbackBeforeExit(newId);
  maybeIncrementProjectStateVersion(incrementVersion);
  return newId;
}
