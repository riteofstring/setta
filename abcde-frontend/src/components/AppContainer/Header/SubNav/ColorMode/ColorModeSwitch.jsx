import { useUserSettings } from "models/userSettings";
import { useEffect } from "react";
import { Toggle } from "utils/atoms/toggles/Toggle";

export function ColorModeSwitch() {
  const darkMode = useUserSettings((x) => x.darkMode);
  const onCheckedChange = () =>
    useUserSettings.getState().setDarkMode(!darkMode);

  useEffect(() => {
    if (darkMode) {
      document.getElementById("root").classList.add("dark");
    } else {
      document.getElementById("root").classList.remove("dark");
    }
  }, [darkMode]);

  return (
    <div className="mr-4 flex flex-1 content-center justify-end">
      <Toggle checked={darkMode} onCheckedChange={onCheckedChange} />
    </div>
  );
}
