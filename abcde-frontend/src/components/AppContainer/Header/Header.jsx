import "@fontsource/jetbrains-mono/600.css";
import { useCurrPage } from "models/currPage";
import { HOME } from "utils/pageNames";
import MainSideDrawer from "./MainSideDrawer/MainSideDrawer";
import SubNav from "./SubNav/SubNav";

export default function HeaderContainer() {
  return (
    <FlexContainer>
      <SiteLogo />
      <SubNav />

      <MainSideDrawer />
    </FlexContainer>
  );
}

// TODO try to use the NAVBAR_HEIGHT constant here
function FlexContainer(props) {
  return (
    <div className="w-[calc(100vw-5rem)] h-14 items-center flex flex-row">
      {props.children}
    </div>
  );
}

function SiteLogo() {
  const setCurrPage = useCurrPage((x) => x.setName);
  return (
    <h2
      className="no-underline select-none cursor-pointer text-gray-600 mr-4 tracking-tight text-lg font-semibold [font-family:JetBrains Mono]"
      onClick={() => setCurrPage(HOME)}
    >
      <span className="text-[#00B5D8]">run</span>
      coder
    </h2>
  );
}
