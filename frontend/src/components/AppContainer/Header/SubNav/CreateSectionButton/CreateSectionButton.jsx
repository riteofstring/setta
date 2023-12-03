import { HiPlus } from "react-icons/hi";
import { addSectionInEmptySpace } from "thunks/addSectionInEmptySpace";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { SECTION } from "z_utils/constants";

export function CreateSectionButton() {
  const onClick = () => addSectionInEmptySpace({ type: SECTION });
  return (
    <MenuBarButton onClick={onClick}>
      <HiPlus className="h-4 w-4" /> Card
    </MenuBarButton>
  );
}
