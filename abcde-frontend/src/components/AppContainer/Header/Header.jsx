import MainSideMenu from "./MainSideMenu/MainSideMenu";
import { SiteLogo } from "./SiteLogo";
import SubNav from "./SubNav/SubNav";

export default function HeaderContainer() {
  return (
    <FlexContainer>
      <SiteLogo />
      <SubNav />
      <MainSideMenu />
    </FlexContainer>
  );
}

// TODO try to use the NAVBAR_HEIGHT constant here
function FlexContainer({ children }) {
  return (
    <div className="w-[100vw] px-11 min-h-[56px] h-[56px] items-center flex flex-row z-20 shadow-md">
      {children}
    </div>
  );
}
