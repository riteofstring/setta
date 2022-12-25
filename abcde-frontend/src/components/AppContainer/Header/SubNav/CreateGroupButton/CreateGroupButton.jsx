import { useAddSectionInEmptySpace } from "hooks/useAddSectionInEmptySpace";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export default function CreateGroupButton() {
  const addSection = useAddSectionInEmptySpace({ isDeck: true });
  return <MenuBarButton onClick={addSection}>Create Deck</MenuBarButton>;
}
