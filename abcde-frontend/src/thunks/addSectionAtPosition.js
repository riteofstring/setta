import { DECK_UI_TYPE_ID } from "abcde-utils/src/constants";
import { useProjectConfig } from "models/info/projectConfig";
import { createDefaultSectionInfo } from "./sections";

export function addSectionAtPosition({
  isDeck,
  initialPosition,
  fnAfterAddSection = () => undefined,
}) {
  const addChildren = useProjectConfig.getState().addChildren;
  const sectionProps = { initialPosition };
  const configProps = {};
  if (isDeck) {
    sectionProps.name = "Deck";
    configProps.uiTypeId = DECK_UI_TYPE_ID;
  }
  const [newId] = createDefaultSectionInfo({ sectionProps, configProps });
  addChildren([newId]);
  fnAfterAddSection(newId);
}
