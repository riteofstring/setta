import { useProjectConfig } from "models/info/projectConfig";
import { DECK_UI_TYPE_ID } from "utils/constants";
import { createDefaultSectionInfo } from "./sections";

export function addSectionAtPosition({
  isDeck,
  initialPosition,
  fnAfterAddSection = () => {},
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
