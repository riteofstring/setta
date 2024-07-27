import _ from "lodash";
import { useCallback, useState } from "react";
import { setHomePageSearch } from "state/actions/search/homePageSearch";
import { updateSearch } from "state/actions/search/projectSearch";
import { useHomePageSearch } from "state/definitions";
import { getInfoViewHandlers } from "state/actions/infoView";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { constInfoViews } from "utils/constants";
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
      className={`z-20 flex h-12 min-h-12 w-[100vw] flex-row items-center bg-white px-11 shadow-md dark:bg-setta-800`}
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
  const infoViewHandlers = getInfoViewHandlers(constInfoViews.NAVBAR_SEARCH);

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
  return (
    <Search
      placeholder="Filter Projects"
      value={value}
      onChange={setHomePageSearch}
    />
  );
}

function Search({ placeholder, value, onChange, ...props }) {
  return (
    <StandardSearch
      outerClasses="self-center w-[clamp(10rem,_30vw,_15rem)]  ml-4"
      inputStyles="flex-grow outline-0 cursor-auto overflow-hidden bg-setta-100 dark:bg-setta-900 hover:bg-white  hover:ring-setta-200 dark:hover:ring-setta-600 transition-all focus:bg-white rounded-full text-xs text-setta-900 dark:text-setta-200 ring-2 ring-transparent focus-visible:ring-blue-300 pl-7 py-1"
      leftElementStyles="pl-1"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}
