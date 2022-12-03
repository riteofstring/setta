import { useStoreActions } from "easy-peasy";
import MenuBarButton from "utils/atoms/buttons/MenuBarButton";

export default function CreateGroupButton() {
  const addSection = useStoreActions((x) => x.thunks.addSectionAtPosition);
  function onClick() {
    addSection({ isDeck: true, initialPosition: { x: 0, y: 0 } });
  }

  return <MenuBarButton onClick={onClick}>Create Deck</MenuBarButton>;
}
