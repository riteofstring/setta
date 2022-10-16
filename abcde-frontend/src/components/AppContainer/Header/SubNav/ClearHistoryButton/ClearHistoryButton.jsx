import MenuBarButton from "components/Common/Button/MenuBarButton";
import { BiHistory } from "react-icons/bi";

export default function ClearHistoryButton() {
  return (
    <MenuBarButton>
      <BiHistory />
      Clear History
    </MenuBarButton>
  );
}
