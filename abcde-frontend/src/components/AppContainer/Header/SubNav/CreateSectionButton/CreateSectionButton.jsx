import { useAddSectionInEmptySpace } from "hooks/useAddSectionInEmptySpace";
import { HiPlus } from "react-icons/hi";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function CreateSectionButton() {
  const addSection = useAddSectionInEmptySpace({ isDeck: false });
  return (
    <MenuBarButton onClick={addSection}>
      <HiPlus className="w-4 h-4" /> Card
    </MenuBarButton>
  );
}
