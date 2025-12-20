import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import { useEffect } from "react";
import { HiMoon } from "react-icons/hi";
import { RiSunFill } from "react-icons/ri";
import { toggleDarkMode } from "state/actions/localStorage";
import { useLocalStorage } from "state/definitions";
import { HelpText } from "./HelpText";
import { Notification } from "./Notification";

export function DarkModeSwitch({
  showNotifications,
}: {
  showNotifications: boolean;
}) {
  const darkMode = useDarkMode();

  return (
    <div className="relative flex flex-1 items-center justify-end">
      {showNotifications && <Notification overlay={true} />}
      <div className="relative z-10">
        <HelpText />
      </div>
      <div className="relative z-30">
        <Toggle
          checked={darkMode}
          onCheckedChange={toggleDarkMode}
          twThumbClasses="flex"
          disableBg={true}
          height="h-3"
          width="w-3"
          icon={
            darkMode ? (
              <HiMoon className="h-3 text-blue-200" />
            ) : (
              <RiSunFill className="h-3 text-white" />
            )
          }
        />
      </div>
    </div>
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
