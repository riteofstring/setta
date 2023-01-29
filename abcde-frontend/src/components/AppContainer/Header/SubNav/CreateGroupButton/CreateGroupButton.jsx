import { useAddSectionInEmptySpace } from "hooks/useAddSectionInEmptySpace";
import { AiOutlineGroup } from "react-icons/ai";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function CreateGroupButton() {
  const addSection = useAddSectionInEmptySpace({ isDeck: true });
  return (
    <MenuBarButton onClick={addSection}>
      <AiOutlineGroup className="w-4 h-4" />
      Group
    </MenuBarButton>
  );
}
