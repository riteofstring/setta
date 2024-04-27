import _ from "lodash";
import { initialShortcuts, useSettings } from "models/settings";
import { useEffect, useRef, useState } from "react";

const settingNames = Object.keys(initialShortcuts);

export function ShortcutSettings() {
  const settings = useSettings(
    (x) => _.map(_.pick(x, settingNames), (v, k) => ({ name: k, value: v })),
    _.isEqual,
  );

  return (
    <>
      {settings.map((setting, index) => (
        <ShortcutSetting key={index} setting={setting} />
      ))}
    </>
  );
}

function ShortcutSetting({ setting }) {
  const [listening, setIsListening] = useState(false);
  const [tempShortcut, setTempShortcut] = useState(setting.value);
  const [preventReset, setPreventReset] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    setTempShortcut(setting.value);
  }, [setting.value]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!listening) return;

      if (event.key === "Tab" || event.key === "Escape") {
        inputRef.current.blur();
        return;
      }

      event.preventDefault();
      const keys = [];
      if (event.ctrlKey) keys.push("ctrl");
      if (event.shiftKey) keys.push("shift");
      if (event.altKey) keys.push("alt");
      if (!["Control", "Shift", "Alt"].includes(event.key)) {
        keys.push(event.key.toLowerCase());
      }

      const shortcutString = keys.join("+");
      setTempShortcut(shortcutString);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [listening]);

  function resetToSavedValue() {
    setIsListening(false);
    setTempShortcut(setting.value);
  }

  function saveShortcut() {
    setIsListening(false);
    useSettings.setState({ [setting.name]: tempShortcut });
    setPreventReset(false);
  }

  return (
    <div className="relative -mx-3 flex items-center justify-between rounded-lg px-3 py-1 hover:bg-runcoder-200/25 dark:hover:bg-runcoder-800/50">
      <label className="mr-2 break-all text-runcoder-700 dark:text-runcoder-100">
        {setting.name}
      </label>
      <input
        type="text"
        value={tempShortcut}
        className="rounded-lg bg-runcoder-200 px-2 py-1 dark:bg-runcoder-800  dark:text-runcoder-50"
        onFocus={() => setIsListening(true)}
        onBlur={() => {
          !preventReset && resetToSavedValue();
        }}
        onChange={() => {}}
        ref={inputRef}
      />

      {listening && tempShortcut !== setting.value && (
        <button
          className="dark:hover:bg-runcoder-850; absolute right-0 mr-4 cursor-pointer rounded-lg bg-runcoder-300 px-2 py-1 text-xs text-runcoder-800 hover:bg-runcoder-400 dark:bg-runcoder-700 dark:text-runcoder-200"
          onClick={saveShortcut}
          onMouseDown={() => setPreventReset(true)}
        >
          Save
        </button>
      )}
    </div>
  );
}
