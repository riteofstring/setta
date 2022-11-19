import { CgCommunity } from "react-icons/cg";
import MenuBarButton from "utils/atoms/buttons/MenuBarButton";

export default function EcoSysButton() {
  return (
    <>
      <MenuBarButton onClick={onOpen}>
        <CgCommunity />
        Templates
      </MenuBarButton>
      {/* <EcoSysModal /> */}
    </>
  );
}
