import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { DECK_UI_TYPE_ID } from "z_utils/constants";
import { newSectionInfo } from "z_utils/objs/sectionInfo";
import { SectionPositionType } from "z_utils/types/sectionPosition";
import { createSectionInfo } from "./createSectionInfo";

type callbackBeforeExitType = (newId: string) => void;

export function addSectionAtPosition({
  isDeck,
  topLevelPosition,
  callbackBeforeExit = () => undefined,
  incrementVersion = false,
}: {
  isDeck: boolean;
  topLevelPosition: SectionPositionType;
  callbackBeforeExit?: callbackBeforeExitType;
  incrementVersion?: boolean;
}) {
  const sectionProps: Partial<Parameters<typeof newSectionInfo>[0]> = {};
  if (isDeck) {
    sectionProps.name = "Group";
    sectionProps.uiTypeId = DECK_UI_TYPE_ID;
  }
  const [newId] = createSectionInfo({
    sectionProps,
    isTopLevel: true,
    topLevelPosition,
  });
  callbackBeforeExit(newId);
  maybeIncrementProjectStateVersion(incrementVersion);
}
