import * as Switch from "@radix-ui/react-switch";
import { useEffect } from "react";
import { HiMoon } from "react-icons/hi";
import { RiSunFill } from "react-icons/ri";
import { toggleDarkMode } from "state/actions/localStorage";
import { useLocalStorage } from "state/definitions";

export function DarkModeSwitch() {
  const darkMode = useDarkMode();
  const toggleRootClasses =
    "relative z-20 items-center p-[0.2rem] w-7 min-w-7 h-3 bg-setta-400 dark:bg-setta-600 rounded-full inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none";
  const toggleThumbClasses =
    "block w-3 h-3 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 flex";

  return (
    <Switch.Root
      className={toggleRootClasses}
      checked={darkMode}
      onCheckedChange={toggleDarkMode}
    >
      <Switch.Thumb className={toggleThumbClasses}>
        {darkMode ? (
          <HiMoon className="h-3 text-blue-200" />
        ) : (
          <RiSunFill className="h-3 text-white" />
        )}
      </Switch.Thumb>
    </Switch.Root>
  );
}

function useDarkMode() {
  const darkMode = useLocalStorage((x) => x.darkMode);

  useEffect(() => {
    if (darkMode) {
      document.querySelector("html")?.classList.add("dark");
    } else {
      document.querySelector("html")?.classList.remove("dark");
    }
  }, [darkMode]);

  return darkMode;
}
