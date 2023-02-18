import { CgCommunity } from "react-icons/cg";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { router } from "utils/Routes/router";

export function CommunityButton() {
  return (
    <MenuBarButton
      onClick={() => {
        router.navigate("/community");
      }}
    >
      <CgCommunity />
      Community
    </MenuBarButton>
  );
}
