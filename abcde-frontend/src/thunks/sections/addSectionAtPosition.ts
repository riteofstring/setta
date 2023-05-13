import { DECK_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newSectionConfig } from "abcde-utils/src/objs/sectionConfig";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { SectionPositionType } from "abcde-utils/src/types/sectionPosition";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { createDefaultSectionInfo } from "./createSectionInfo";

type callbackBeforeExitType = (newId: string) => void;

export function addSectionAtPosition({
  isDeck,
  initialPosition,
  callbackBeforeExit = () => undefined,
  incrementVersion = false,
}: {
  isDeck: boolean;
  initialPosition: SectionPositionType;
  callbackBeforeExit?: callbackBeforeExitType;
  incrementVersion?: boolean;
}) {
  const sectionProps: Partial<Parameters<typeof newSectionInfo>[0]> = {
    initialPosition,
  };
  const configProps: Parameters<typeof newSectionConfig>[0] = {};
  if (isDeck) {
    sectionProps.name = "Group";
    configProps.uiTypeId = DECK_UI_TYPE_ID;
  }
  const [newId] = createDefaultSectionInfo({
    sectionProps,
    configProps,
    isTopLevel: true,
  });
  callbackBeforeExit(newId);
  maybeIncrementProjectStateVersion(incrementVersion);
}
