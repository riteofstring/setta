import { DECK_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newSectionConfig } from "abcde-utils/src/objs/sectionConfig";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { SectionPositionType } from "abcde-utils/src/types/sectionPosition";
import { createDefaultSectionInfo } from "./createSectionInfo";

type callbackBeforeExitType = (newId: string) => void;

export function addSectionAtPosition({
  isDeck,
  initialPosition,
  callbackBeforeExit = () => undefined,
}: {
  isDeck: boolean;
  initialPosition: SectionPositionType;
  callbackBeforeExit?: callbackBeforeExitType;
}) {
  const sectionProps: Partial<Parameters<typeof newSectionInfo>[0]> = {
    initialPosition,
  };
  const configProps: Parameters<typeof newSectionConfig>[0] = {};
  if (isDeck) {
    sectionProps.name = "Deck";
    configProps.uiTypeId = DECK_UI_TYPE_ID;
  }
  const [newId] = createDefaultSectionInfo({
    sectionProps,
    configProps,
    isTopLevel: true,
  });
  callbackBeforeExit(newId);
}
