import { DECK_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newSectionConfig } from "abcde-utils/src/objs/sectionConfig";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { SectionPositionType } from "abcde-utils/src/types/sectionPosition";
import { useProjectConfig } from "models/info/projectConfig";
import { createDefaultSectionInfo } from "./sections";

type fnAfterAddSectionType = (newId: string) => void;

export function addSectionAtPosition({
  isDeck,
  initialPosition,
  fnAfterAddSection = () => undefined,
}: {
  isDeck: boolean;
  initialPosition: SectionPositionType;
  fnAfterAddSection?: fnAfterAddSectionType;
}) {
  const addChildren = useProjectConfig.getState().addChildren;
  const sectionProps: Parameters<typeof newSectionInfo>[0] = {
    initialPosition,
  };
  const configProps: Parameters<typeof newSectionConfig>[0] = {};
  if (isDeck) {
    sectionProps.name = "Deck";
    configProps.uiTypeId = DECK_UI_TYPE_ID;
  }
  const [newId] = createDefaultSectionInfo({ sectionProps, configProps });
  addChildren([newId]);
  fnAfterAddSection(newId);
}
