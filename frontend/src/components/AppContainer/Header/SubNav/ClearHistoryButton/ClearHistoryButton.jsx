import { BiHistory } from "react-icons/bi";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function ClearHistoryButton() {
  return (
    <MenuBarButton>
      <BiHistory />
      Clear History
    </MenuBarButton>
  );
}
