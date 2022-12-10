import { useAddSectionInEmptySpace } from "hooks/useAddSectionInEmptySpace";
import MenuBarButton from "utils/atoms/buttons/MenuBarButton";

export default function CreateSectionButton() {
  const addSection = useAddSectionInEmptySpace({ isDeck: false });
  return <MenuBarButton onClick={addSection}>New Card</MenuBarButton>;
}
