import { getDefaultInfoTitle } from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/MarkdownEditor/MarkdownEditor";
import C from "constants/constants.json";
import { useSettings } from "models/settings";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import {
  CODE_UI_TYPE_ID,
  DECK_UI_TYPE_ID,
  DICT_ROOT_UI_TYPE_ID,
  GLOBAL_PARAM_SWEEP_UI_TYPE_ID,
  GLOBAL_VARIABLES_UI_TYPE_ID,
  INFO_UI_TYPE_ID,
  LIST_ROOT_UI_TYPE_ID,
  TERMINAL_UI_TYPE_ID,
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

  const settings = useSettings.getState();
  sectionProps.size = settings.defaultSectionSize;
  if (type === C.DECK) {
    sectionProps.uiTypeId = DECK_UI_TYPE_ID;
  } else if (type === C.GLOBAL_VARIABLES) {
    sectionProps.name = "Global Variables";
    sectionProps.uiTypeId = GLOBAL_VARIABLES_UI_TYPE_ID;
  } else if (type === C.CODE) {
    sectionProps.name = "Code";
    sectionProps.uiTypeId = CODE_UI_TYPE_ID;
    sectionProps.size = settings.defaultCodeSectionSize;
  } else if (type === C.VAR_CONTROL) {
    sectionProps.name = "Var Control";
    sectionProps.uiTypeId = VAR_CONTROL_UI_TYPE_ID;
    sectionProps.size = settings.defaultCodeSectionSize;
  } else if (type === C.TERMINAL) {
    sectionProps.uiTypeId = TERMINAL_UI_TYPE_ID;
    sectionProps.size = settings.defaultTerminalSectionSize;
  } else if (type === C.GLOBAL_PARAM_SWEEP) {
    sectionProps.name = "Global Param Sweep";
    sectionProps.uiTypeId = GLOBAL_PARAM_SWEEP_UI_TYPE_ID;
  } else if (type === C.LIST_ROOT) {
    sectionProps.uiTypeId = LIST_ROOT_UI_TYPE_ID;
  } else if (type === C.DICT_ROOT) {
    sectionProps.uiTypeId = DICT_ROOT_UI_TYPE_ID;
  } else if (type === C.INFO) {
    sectionProps.name = getDefaultInfoTitle();
    sectionProps.uiTypeId = INFO_UI_TYPE_ID;
  }

  const [newId] = createSectionInfo({ sectionProps, position });
  callbackBeforeExit(newId);
  maybeIncrementProjectStateVersion(incrementVersion);
  return newId;
}
