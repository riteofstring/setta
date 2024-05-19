import { useDarkMode } from "hooks/localStorageHooks";
import { useEffect } from "react";
import { HiMoon } from "react-icons/hi";
import { RiSunFill } from "react-icons/ri";
import { toggleDarkMode } from "thunks/user/settings";
import { Toggle } from "utils/atoms/toggles/Toggle";

export function ColorModeSwitch() {
  const [darkMode] = useDarkMode();

  useEffect(() => {
    if (darkMode) {
      document.querySelector("html").classList.add("dark");
    } else {
      document.querySelector("html").classList.remove("dark");
    }
  }, [darkMode]);

  return (
    <div className="flex flex-1 content-center justify-end">
      <Toggle
        checked={darkMode}
        onCheckedChange={toggleDarkMode}
        twThumbClasses="flex"
        disableBg={true}
        icon={
          darkMode ? (
            <HiMoon className="h-3 text-blue-200" />
          ) : (
            <RiSunFill className="h-3 text-white" />
          )
        }
      />
    </div>
  );
}
