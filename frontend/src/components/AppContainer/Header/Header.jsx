import { constInfoViews, useSetCurrInfoView } from "models/info/infoView";
import { useSearch } from "models/search";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { Notification } from "./Notification/Notification";
import { SiteLogo } from "./SiteLogo";
import { ColorModeSwitch } from "./SubNav/ColorMode/ColorModeSwitch";
import { SubNav } from "./SubNav/SubNav";

export function HeaderContainer() {
  return (
    <FlexContainer>
      <SiteLogo />
      <SubNav />
      <Search searchPlaceholder="Search Project" />
      <Notification />
      <ColorModeSwitch />
      {/* <MainSideMenu /> */}
    </FlexContainer>
  );
}

function FlexContainer({ children }) {
  return (
    <header
      className={`min-h-12 z-20 flex h-12 w-[100vw] flex-row items-center bg-white px-11 shadow-md dark:bg-slate-800`}
    >
      {children}
    </header>
  );
}

function Search({ searchPlaceholder }) {
  const value = useSearch((x) => x.value);
  const setValue = useSearch((x) => x.setValue);
  const infoViewHandlers = useSetCurrInfoView(constInfoViews.NAVBAR_SEARCH);

  return (
    <StandardSearch
      outerClasses="self-center w-[clamp(10rem,_30vw,_15rem)]  ml-4"
      inputStyles="flex-grow outline-0 cursor-auto overflow-hidden bg-slate-100 dark:bg-runcoder-900 hover:bg-white  hover:ring-slate-200 dark:hover:ring-runcoder-600 transition-all focus:bg-white rounded-full text-xs text-runcoder-900 dark:text-runcoder-200 ring-2 ring-transparent focus-visible:ring-blue-300 pl-7 py-1"
      leftElementStyles="pl-1"
      placeholder={searchPlaceholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      {...infoViewHandlers}
    />
  );
}
