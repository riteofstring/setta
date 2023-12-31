import { AiOutlineGroup } from "react-icons/ai";
import { addSectionInEmptySpace } from "thunks/addSectionInEmptySpace";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function CreateGroupButton() {
  const onClick = () => addSectionInEmptySpace({ isDeck: true });
  return (
    <MenuBarButton onClick={onClick}>
      <AiOutlineGroup className="h-4 w-4" />
      Group
    </MenuBarButton>
  );
}
