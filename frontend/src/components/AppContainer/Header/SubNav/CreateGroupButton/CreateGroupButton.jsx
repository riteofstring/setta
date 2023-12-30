import { AiOutlineGroup } from "react-icons/ai";
import { addSectionInEmptySpace } from "thunks/addSectionInEmptySpace";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { DECK } from "z_utils/constants";

export function CreateGroupButton() {
  const onClick = () => addSectionInEmptySpace({ type: DECK });
  return (
    <MenuBarButton onClick={onClick}>
      <AiOutlineGroup className="h-4 w-4" />
      Group
    </MenuBarButton>
  );
}
