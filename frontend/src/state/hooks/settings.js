import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "state/definitions";

export function useShortcutSettings() {
  function shortcutsOnly(x) {
    const output = [];
    for (const [k, v] of Object.entries(x)) {
      // TODO: make this less hacky
      if (k.includes("Shortcut")) {
        output.push({ name: k, value: v });
      }
    }
    return output;
  }
  return useSettings((x) => shortcutsOnly(x), _.isEqual);
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
      if (event.ctrlKey) keys.push("Ctrl");
      if (event.shiftKey) keys.push("Shift");
      if (event.altKey) keys.push("Alt");
      if (event.metaKey) keys.push("Mod");
      if (!["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
        keys.push(event.key.toUpperCase());
      }

      const shortcutString = keys.join(" + ");
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

export function useSimpleSettings() {
  function processStoredValue(value) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return JSON.stringify(value);
    }
    return value;
  }

  function processEnteredValue(name, value) {
    if (name === "snapGrid") {
      return value.split(",");
    } else {
      try {
        return JSON.parse(value);
      } catch (error) {
        return value; // Or any other appropriate error handling or default value
      }
    }
  }

  const settings = useSettings(
    (x) =>
      // TODO: make this less hacky
      _.map(
        _.pickBy(
          x,
          (v, k) => typeof v !== "function" && !k.includes("Shortcut"),
        ),
        (v, k) => ({
          name: k,
          value: processStoredValue(v),
        }),
      ),
    _.isEqual,
  );

  const handleInputChange = (index, newValue) => {
    const { name } = settings[index];
    useSettings.setState({ [name]: processEnteredValue(name, newValue) });
  };

  return [settings, handleInputChange];
}
