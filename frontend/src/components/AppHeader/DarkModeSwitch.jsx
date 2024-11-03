import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import { HiMoon } from "react-icons/hi";
import { RiSunFill } from "react-icons/ri";
import { toggleDarkMode } from "state/actions/localStorage";
import { useDarkMode } from "state/hooks/localStorage";
import { HelpText } from "./HelpText";

export function DarkModeSwitch() {
  const darkMode = useDarkMode();

  return (
    <div className="flex flex-1 content-center justify-end">
      <HelpText />
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
