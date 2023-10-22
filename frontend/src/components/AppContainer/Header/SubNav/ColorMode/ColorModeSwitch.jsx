import { useSettings } from "models/settings";
import { useEffect } from "react";
import { toggleDarkMode } from "thunks/user/settings";
import { Toggle } from "utils/atoms/toggles/Toggle";

export function ColorModeSwitch() {
  const darkMode = useSettings((x) => x.darkMode);

  useEffect(() => {
    if (darkMode) {
      document.querySelector("html").classList.add("dark");
    } else {
      document.querySelector("html").classList.remove("dark");
    }
  }, [darkMode]);

  return (
    <div className="mr-4 flex flex-1 content-center justify-end">
      <Toggle checked={darkMode} onCheckedChange={toggleDarkMode} />
    </div>
  );
}
