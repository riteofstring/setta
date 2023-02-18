import { ConstantInfoView, useSetCurrInfoView } from "models/info/infoView";
import { CgCommunity } from "react-icons/cg";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { router } from "utils/Routes/router";

export function CommunityButton() {
  const infoViewHandlers = useSetCurrInfoView(
    ConstantInfoView.BUTTON_COMMUNITY
  );
  return (
    <MenuBarButton
      onClick={() => {
        router.navigate("/community");
      }}
      {...infoViewHandlers}
    >
      <CgCommunity />
      Community
    </MenuBarButton>
  );
}
