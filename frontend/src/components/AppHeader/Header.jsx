import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { setHomePageSearch } from "state/actions/search/homePageSearch";
import { useHomePageSearch, useMisc } from "state/definitions";
import {
  useOnEnterGoToSearchResult,
  useUpdateProjectSearch,
} from "state/hooks/search";
import { HOME_ROUTER_PATH, PROJECT_CONFIG_ROUTER_PATH } from "utils/constants";
import { DarkModeSwitch } from "./DarkModeSwitch";
import { Notification } from "./Notification";
import { ProjectNav } from "./ProjectNav";
import { SiteLogo } from "./SiteLogo";

export function HeaderContainer({ path }) {
  const projectIs404 = useMisc((x) => x.projectIs404);
  return (
    <header
      className={`z-20 flex h-12 min-h-12 w-[100vw] flex-row items-center border-b border-transparent bg-white px-4 shadow-md dark:border-setta-700/30 dark:bg-setta-875 `}
    >
      <SiteLogo />
      {!projectIs404 && (
        <>
          <ProjectNav />
          <SearchSwitch path={path} />
          <Notification />
        </>
      )}
      <DarkModeSwitch />
    </header>
  );
}

function SearchSwitch({ path }) {
  switch (path) {
    case HOME_ROUTER_PATH:
      return <HomePageSearch />;
    case PROJECT_CONFIG_ROUTER_PATH:
      return <ProjectPageSearch />;
    default:
      return null;
  }
}

function ProjectPageSearch() {
  const { value, onChange, onBlur, onFocus } = useUpdateProjectSearch();
  const onKeyDown = useOnEnterGoToSearchResult();

  return (
    <Search
      placeholder="Search Project"
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onFocus={onFocus}
      {...getFloatingBoxHandlers(
        "Search your entire project from one location.",
      )}
    />
  );
}

function HomePageSearch() {
  const value = useHomePageSearch((x) => x.value);
  return (
    <Search
      placeholder="Filter Project Configs"
      value={value}
      onChange={setHomePageSearch}
    />
  );
}

function Search({ placeholder, value, onChange, ...props }) {
  return (
    <StandardSearch
      id="HeaderProjectSearch"
      outerClasses="self-center w-[clamp(10rem,_30vw,_15rem)]  ml-4"
      inputStyles="flex-grow outline-0 cursor-auto overflow-hidden bg-setta-100 dark:bg-setta-950 hover:bg-white  hover:ring-setta-200 dark:hover:ring-setta-600 focus:bg-white rounded-full text-xs text-setta-900 dark:text-setta-200 ring-2 ring-transparent focus-visible:ring-blue-300 pl-7 py-1 placeholder-setta-300 dark:placeholder-setta-700"
      leftElementStyles="pl-1"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}
