import { useCurrPage } from "models/currPage";
import { HOME } from "utils/pageNames";
import MainSideMenu from "./MainSideMenu/MainSideMenu";
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
    <div className="w-[100vw] px-11 h-14 items-center flex flex-row z-20 shadow-md">
      {children}
    </div>
  );
}

function SiteLogo() {
  const setCurrPage = useCurrPage((x) => x.setName);
  return (
    <h2
      className="no-underline select-none cursor-pointer text-gray-600 mr-4 tracking-tight text-lg font-semibold font-logo"
      onClick={() => setCurrPage(HOME)}
    >
      <span className="text-[#00B5D8]">run</span>
      coder
    </h2>
  );
}
