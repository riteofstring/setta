import { SiCodereview } from "react-icons/si";
import { requestTypeCheck } from "thunks/websocket";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function TypeCheckButton() {
  const onClick = () => requestTypeCheck();
  return (
    <MenuBarButton onClick={onClick}>
      {/* <AiOutlineGroup className="h-4 w-4" /> */}
      <SiCodereview />
    </MenuBarButton>
  );
}
