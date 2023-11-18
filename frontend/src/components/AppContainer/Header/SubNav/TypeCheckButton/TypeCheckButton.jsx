import { GrInspect } from "react-icons/gr";
import { requestTypeCheck } from "thunks/websocket";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function TypeCheckButton() {
  const onClick = () => requestTypeCheck();
  return (
    <MenuBarButton onClick={onClick}>
      <GrInspect className="" />
    </MenuBarButton>
  );
}
