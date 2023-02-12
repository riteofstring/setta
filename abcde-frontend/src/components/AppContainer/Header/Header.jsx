import { MainSideMenu } from "./MainSideMenu/MainSideMenu";
import { SiteLogo } from "./SiteLogo";
import { SubNav } from "./SubNav/SubNav";

export function HeaderContainer() {
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
    <div className="z-20 flex h-[56px] min-h-[56px] w-[100vw] flex-row items-center bg-white px-11 shadow-md">
      {children}
    </div>
  );
}
