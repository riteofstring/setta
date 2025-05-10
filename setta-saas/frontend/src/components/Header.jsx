import { useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import { SiteLogo } from "./SiteLogo";
import SearchBar from "./SearchBar";
import ProjectMenu from "./ProjectMenu";

export default function Header() {
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";

  return (
    <header className="z-20 flex h-12 min-h-12 w-[100vw] flex-row items-center border-b border-transparent bg-white px-4 shadow-md dark:border-setta-700/30 dark:bg-setta-875">
      <SiteLogo />

      {!isLoginPage && (
        <>
          <ProjectMenu />
          <SearchBar />
        </>
      )}

      <ThemeToggle />
    </header>
  );
}
