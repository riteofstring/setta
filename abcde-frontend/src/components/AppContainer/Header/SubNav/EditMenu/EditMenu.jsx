import { useAddSectionInEmptySpace } from "hooks/useAddSectionInEmptySpace";
import { AiOutlineGroup } from "react-icons/ai";
import { HiPlus } from "react-icons/hi";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { Item } from "utils/atoms/dropdown/item";

export function EditMenu() {
  return (
    <StandardDropdown
      trigger={<MenuBarButton>Edit</MenuBarButton>}
      content={<Items />}
    />
  );
}

function Items() {
  const addSection = useAddSectionInEmptySpace({ isDeck: false });
  const addGroup = useAddSectionInEmptySpace({ isDeck: true });
  return (
    <>
      <Item onClick={addSection}>
        <HiPlus className="h-4 w-4" /> Card
      </Item>
      <Item onClick={addGroup}>
        <AiOutlineGroup className="h-4 w-4" /> Group
      </Item>
    </>
  );
}
