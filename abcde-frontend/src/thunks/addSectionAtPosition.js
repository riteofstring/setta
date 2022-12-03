import { thunk } from "easy-peasy";
import { DECK_UI_TYPE_ID } from "utils/constants";

export const addSectionAtPosition = thunk((actions, payload, helpers) => {
  const { isDeck, initialPosition, fnAfterAddSection = () => {} } = payload;
  const a = helpers.getStoreActions();
  const addSection = a.thunks.createDefaultSectionInfo;
  const addChildren = a.projectConfig.addChildren;
  const sectionProps = { initialPosition };
  const configProps = {};
  if (isDeck) {
    sectionProps.name = "Deck";
    configProps.uiTypeId = DECK_UI_TYPE_ID;
  }
  const [newId] = addSection({ sectionProps, configProps });
  addChildren([newId]);
  fnAfterAddSection(newId);
});
