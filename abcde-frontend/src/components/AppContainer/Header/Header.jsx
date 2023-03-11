import { ConstantInfoView, useSetCurrInfoView } from "models/info/infoView";
import { useSearch } from "models/search";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { MainSideMenu } from "./MainSideMenu/MainSideMenu";
import { SiteLogo } from "./SiteLogo";
import { SubNav } from "./SubNav/SubNav";

export function HeaderContainer() {
  return (
    // <div className="grid grid-cols-1 grid-rows-1">
    <FlexContainer>
      <SiteLogo />
      <SubNav />
      <Search searchPlaceholder="Search Project" />
      <MainSideMenu />
    </FlexContainer>

    // </div>
  );
}

// TODO try to use the NAVBAR_HEIGHT constant here
// col-start-1 col-end-2 row-start-1 row-end-2 place-self-start
function FlexContainer({ children }) {
  return (
    <div className="min-h-12 z-20 flex h-12 w-[100vw] flex-row items-center  bg-white px-11 shadow-md">
      {children}
    </div>
  );
}

function Search({ searchPlaceholder }) {
  // col-start-1 col-end-2 row-start-1 row-end-2 place-self-center
  const value = useSearch((x) => x.value);
  const setValue = useSearch((x) => x.setValue);

  const infoViewHandlers = useSetCurrInfoView(ConstantInfoView.NAVBAR_SEARCH);
  return (
    <StandardSearch
      outerClasses="self-center w-[clamp(10rem,_30vw,_15rem)] bg-white ml-4"
      inputStyles="flex-grow outline-0 cursor-auto bg-slate-100 hover:bg-white hover:ring-slate-200 transition-all focus:bg-white rounded-full text-xs text-slate-900 ring-2 ring-transparent focus-visible:ring-blue-300 pl-7 py-1"
      leftElementStyles="pl-1"
      placeholder={searchPlaceholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      {...infoViewHandlers}
    />
  );
}
