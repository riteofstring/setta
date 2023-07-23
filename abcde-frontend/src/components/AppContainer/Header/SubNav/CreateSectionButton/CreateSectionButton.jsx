import { useAddSectionInEmptySpace } from "hooks/useAddSectionInEmptySpace";
import { HiPlus } from "react-icons/hi";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function CreateSectionButton() {
  const addSection = useAddSectionInEmptySpace({ isDeck: false });
  return (
    <MenuBarButton onClick={addSection}>
      <HiPlus className="h-4 w-4" /> Card
    </MenuBarButton>
  );
}
