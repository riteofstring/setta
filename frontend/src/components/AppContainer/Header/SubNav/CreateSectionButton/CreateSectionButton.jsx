import { HiPlus } from "react-icons/hi";
import { addSectionInEmptySpace } from "thunks/addSectionInEmptySpace";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function CreateSectionButton() {
  const onClick = () => addSectionInEmptySpace({ isDeck: false });
  return (
    <MenuBarButton onClick={onClick}>
      <HiPlus className="h-4 w-4" /> Card
    </MenuBarButton>
  );
}
