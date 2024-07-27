import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "state/definitions";
import { initialShortcuts } from "utils/constants";

export function useShortcutSettings() {
  const settingNames = Object.keys(initialShortcuts);
  return useSettings(
    (x) => _.map(_.pick(x, settingNames), (v, k) => ({ name: k, value: v })),
    _.isEqual,
  );
}

export function useSetShorcutSetting(setting) {
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

  function onSaveButtonClick() {
    setIsListening(false);
    useSettings.setState({ [setting.name]: tempShortcut });
    setPreventReset(false);
  }

  function onSaveButtonMouseDown() {
    setPreventReset(true);
  }

  function onFocus() {
    setIsListening(true);
  }

  function onBlur() {
    if (!preventReset) {
      resetToSavedValue();
    }
  }

  return {
    tempShortcut,
    showSaveButton: listening && tempShortcut !== setting.value,
    onSaveButtonClick,
    onSaveButtonMouseDown,
    onFocus,
    onBlur,
    inputRef,
  };
}
