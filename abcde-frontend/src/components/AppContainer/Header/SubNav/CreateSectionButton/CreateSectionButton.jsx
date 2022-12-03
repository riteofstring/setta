import { useStoreActions } from "easy-peasy";
import MenuBarButton from "utils/atoms/buttons/MenuBarButton";

export default function CreateSectionButton() {
  const addSection = useStoreActions((x) => x.thunks.addSectionAtPosition);
  function onClick() {
    addSection({ isDeck: false, initialPosition: { x: 0, y: 0 } });
  }

  return <MenuBarButton onClick={onClick}>New Card</MenuBarButton>;
}
