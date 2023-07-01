import { DECK_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { SectionPositionType } from "abcde-utils/src/types/sectionPosition";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { createDefaultSectionInfo } from "./createSectionInfo";

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
  const [newId] = createDefaultSectionInfo({
    sectionProps,
    isTopLevel: true,
    topLevelPosition,
  });
  callbackBeforeExit(newId);
  maybeIncrementProjectStateVersion(incrementVersion);
}
