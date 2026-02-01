import { useEffect, useRef, useState } from "react";

export function useEditableOnSubmit(
  initialValue: string,
  onSetTitle: (x: string) => void,
  condition: (x: string) => boolean | Promise<boolean>,
  allowEmpty = false,
  normalize: (x: string) => string = (x) => x,
) {
  const [inputValue, setInputValue] = useState(initialValue);
  const blurTriggeredByEscapeKey = useRef(false);

  function onChange(e: React.ChangeEvent<HTMLInputElement> | string) {
    if (typeof e === "string") {
      setInputValue(e);
    } else {
      setInputValue(e.target.value);
    }
  }

  async function onBlur(
    event: React.FocusEvent<HTMLInputElement> | string,
  ) {
    if (blurTriggeredByEscapeKey.current) {
      blurTriggeredByEscapeKey.current = false;
      return;
    }
    const rawValue = typeof event === "string" ? event : event.target.value;
    const v = normalize(rawValue);
    if (v !== rawValue) {
      setInputValue(v);
    }
    if ((allowEmpty || v != "") && v != initialValue && (await condition(v))) {
      onSetTitle(v);
    } else {
      setInputValue(initialValue);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.code === "Escape") {
      blurTriggeredByEscapeKey.current = true;
      event.currentTarget.blur();
      setInputValue(initialValue);
    } else if (event.code === "Enter") {
      event.currentTarget.blur();
    }
  }

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  return { inputValue, onChange, onBlur, onKeyDown, blurTriggeredByEscapeKey };
}
