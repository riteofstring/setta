import { getDefaultInfoTitle } from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/MarkdownEditor/MarkdownEditor";
import C from "constants/constants.json";
import { useSettings } from "state/definitions/settings";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { BASE_UI_TYPE_IDS } from "utils/constants";
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
  } else if (type === C.GLOBAL_VARIABLES) {
    sectionProps.name = "Global Variables";
  } else if (type === C.CODE) {
    sectionProps.name = "Code";
    sectionProps.size = settings.defaultCodeSectionSize;
  } else if (type === C.VAR_CONTROL) {
    sectionProps.name = "Var Control";
    sectionProps.size = settings.defaultCodeSectionSize;
  } else if (type === C.TERMINAL) {
    sectionProps.size = settings.defaultTerminalSectionSize;
  } else if (type === C.GLOBAL_PARAM_SWEEP) {
    sectionProps.name = "Global Param Sweep";
  } else if (type === C.INFO) {
    sectionProps.name = getDefaultInfoTitle();
  }

  sectionProps.uiTypeId = BASE_UI_TYPE_IDS[type];

  const [newId] = createSectionInfo({ sectionProps, position });
  callbackBeforeExit(newId);
  maybeIncrementProjectStateVersion(incrementVersion);
  return newId;
}
