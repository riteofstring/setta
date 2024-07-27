import _ from "lodash";
import { constInfoViews, useSetCurrInfoView } from "models/info/infoView";
import { useHomePageSearch } from "models/useHomePageSearch";
import { updateSearch } from "models/useProjectSearch";
import { useCallback, useState } from "react";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { Notification } from "./Notification/Notification";
import { SiteLogo } from "./SiteLogo";
import { ColorModeSwitch } from "./SubNav/ColorMode/ColorModeSwitch";
import { SubNav } from "./SubNav/SubNav";

export function HeaderContainer({ path }) {
  return (
    <FlexContainer>
      <SiteLogo />
      <SubNav />
      <SearchSwitch path={path} />
      <Notification />
      <ColorModeSwitch />
      {/* <MainSideMenu /> */}
    </FlexContainer>
  );
}

function FlexContainer({ children }) {
  return (
    <header
      className={`z-20 flex h-12 min-h-12 w-[100vw] flex-row items-center bg-white px-11 shadow-md dark:bg-runcoder-800`}
    >
      {children}
    </header>
  );
}

function SearchSwitch({ path }) {
  switch (path) {
    case "/":
      return <HomePageSearch />;
    case ":projectName/:configName":
      return <ProjectPageSearch />;
    default:
      return null;
  }
}

function ProjectPageSearch() {
  const [value, setValue] = useState("");
  const infoViewHandlers = useSetCurrInfoView(constInfoViews.NAVBAR_SEARCH);

  function onChange(v) {
    setValue(v);
    doUpdateSearch(v);
  }

  const doUpdateSearch = useCallback(_.debounce(updateSearch, 100), []);

  return (
    <Search
      placeholder="Search Project"
      value={value}
      onChange={onChange}
      {...infoViewHandlers}
    />
  );
}

function HomePageSearch() {
  const value = useHomePageSearch((x) => x.value);
  const setValue = useHomePageSearch((x) => x.setValue);
  return (
    <Search placeholder="Filter Projects" value={value} onChange={setValue} />
  );
}

function Search({ placeholder, value, onChange, ...props }) {
  return (
    <StandardSearch
      outerClasses="self-center w-[clamp(10rem,_30vw,_15rem)]  ml-4"
      inputStyles="flex-grow outline-0 cursor-auto overflow-hidden bg-runcoder-100 dark:bg-runcoder-900 hover:bg-white  hover:ring-runcoder-200 dark:hover:ring-runcoder-600 transition-all focus:bg-white rounded-full text-xs text-runcoder-900 dark:text-runcoder-200 ring-2 ring-transparent focus-visible:ring-blue-300 pl-7 py-1"
      leftElementStyles="pl-1"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}
