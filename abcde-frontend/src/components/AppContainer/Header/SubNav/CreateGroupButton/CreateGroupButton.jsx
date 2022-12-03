import { useAddSectionAtPosition } from "hooks/useAddSectionAtPosition";
import MenuBarButton from "utils/atoms/buttons/MenuBarButton";

export default function CreateGroupButton() {
  const addSection = useAddSectionAtPosition({});
  function onClick() {
    addSection({ isDeck: true, initialPosition: { x: 0, y: 0 } });
  }

  return <MenuBarButton onClick={onClick}>Create Deck</MenuBarButton>;
}
