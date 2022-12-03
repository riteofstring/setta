import { useStoreActions } from "easy-peasy";
import { DECK_UI_TYPE_ID } from "utils/constants";

export function useAddSectionAtPosition({ fnAfterAddSection = () => {} }) {
  const addSection = useStoreActions((x) => x.thunks.createDefaultSectionInfo);
  const addChildren = useStoreActions((x) => x.projectConfig.addChildren);

  return ({ isDeck, initialPosition }) => {
    const sectionProps = { initialPosition };
    const configProps = {};
    if (isDeck) {
      sectionProps.name = "Deck";
      configProps.uiTypeId = DECK_UI_TYPE_ID;
    }
    const [newId] = addSection({ sectionProps, configProps });
    addChildren([newId]);
    fnAfterAddSection(newId);
  };
}
