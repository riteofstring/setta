import { useRef } from "react";
import { useProjectLoading, useShareSession } from "state/definitions";
import { HOME_ROUTER_PATH, PROJECT_CONFIG_ROUTER_PATH } from "utils/constants";
import { useTabScope } from "utils/focusManager";
import { HelpText } from "./HelpText";
import { Notification } from "./Notification";
import { ProjectNav } from "./ProjectNav";
import { HomePageSearchBar } from "./SearchBar/HomePageSearch";
import { ProjectPageSearchBar } from "./SearchBar/ProjectPageSearch";
import { SiteLogo } from "./SiteLogo";

export function HeaderContainer({ path }: { path: string }) {
  const { projectIsLoading, projectIs404 } = useProjectLoading((x) => ({
    projectIsLoading: x.projectIsLoading,
    projectIs404: x.projectIs404,
  }));
  const isShareMode = useShareSession((x) => x.isShareMode);
  const headerRef = useRef<HTMLElement>(null);
  useTabScope({
    scopeId: "header",
    order: 5,
    rootRef: headerRef,
  });

  return (
    <header
      className={`z-20 flex h-9 min-h-9 w-[100vw] flex-row items-center border-b border-setta-200/75 bg-white px-2 dark:border-setta-850 dark:bg-setta-875 `}
      ref={headerRef}
      data-tab-scope="header"
    >
      <SiteLogo />
      {!projectIsLoading && !projectIs404 && (
        <>
          <ProjectNav />
          <SearchSwitch path={path} />
          {isShareMode && (
            <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-700">
              Sharing Mode
            </span>
          )}
        </>
      )}
      <div className="relative flex flex-1 items-center justify-end">
        <Notification />
        <HelpText />
      </div>
    </header>
  );
}

function SearchSwitch({ path }: { path: string }) {
  switch (path) {
    case HOME_ROUTER_PATH:
      return <HomePageSearchBar />;
    case PROJECT_CONFIG_ROUTER_PATH:
      return <ProjectPageSearchBar />;
    default:
      return null;
  }
}
