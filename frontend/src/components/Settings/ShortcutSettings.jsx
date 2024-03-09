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
    <div className="mt-10 flex justify-center">
      <div>
        {settings.map((setting, index) => (
          <ShortcutSetting key={index} setting={setting} />
        ))}
      </div>
    </div>
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
      if (event.ctrlKey) keys.push("Ctrl");
      if (event.shiftKey) keys.push("Shift");
      if (event.altKey) keys.push("Alt");
      if (!["Control", "Shift", "Alt"].includes(event.key)) {
        keys.push(event.key.toUpperCase());
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
    <div className="mb-4 flex items-center">
      <label className="mr-2 text-white">{setting.name}</label>
      <input
        type="text"
        value={tempShortcut}
        className="rounded bg-gray-800 p-2 text-white"
        onFocus={() => setIsListening(true)}
        onBlur={() => {
          !preventReset && resetToSavedValue();
        }}
        onChange={() => {}}
        ref={inputRef}
      />

      {listening && tempShortcut !== setting.value && (
        <button
          className="text-white"
          onClick={saveShortcut}
          onMouseDown={() => setPreventReset(true)}
        >
          Save
        </button>
      )}
    </div>
  );
}
