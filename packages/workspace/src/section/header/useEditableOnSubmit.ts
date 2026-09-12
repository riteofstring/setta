import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

export function useEditableOnSubmit(
  initialValue: string,
  onSetTitle: (x: string) => void,
  condition: (x: string) => boolean,
  normalize: (x: string) => string = (x) => x,
) {
  const [inputValue, setInputValue] = useState(initialValue);
  const blurTriggeredByEscapeKey = useRef(false);
  const restoreFocusAfterKeyboardSubmit = useRef(false);
  const latestValueRef = useRef(initialValue);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    latestValueRef.current = e.target.value;
    setInputValue(e.target.value);
  }

  function onBlur(event: FocusEvent<HTMLInputElement>) {
    if (blurTriggeredByEscapeKey.current) {
      blurTriggeredByEscapeKey.current = false;
      return;
    }
    const rawValue = event.target.value;
    latestValueRef.current = rawValue;
    const v = normalize(rawValue);
    if (v !== rawValue) {
      latestValueRef.current = v;
      setInputValue(v);
    }
    if (v !== "" && v !== initialValue && condition(v)) {
      latestValueRef.current = v;
      onSetTitle(v);
    } else {
      latestValueRef.current = initialValue;
      setInputValue(initialValue);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" || event.code === "Escape") {
      event.stopPropagation();
      blurTriggeredByEscapeKey.current = true;
      restoreFocusAfterKeyboardSubmit.current = true;
      event.currentTarget.blur();
      latestValueRef.current = initialValue;
      setInputValue(initialValue);
    } else if (event.key === "Enter" || event.code === "Enter") {
      restoreFocusAfterKeyboardSubmit.current = true;
      event.currentTarget.blur();
    }
  }

  useEffect(() => {
    latestValueRef.current = initialValue;
    setInputValue(initialValue);
  }, [initialValue]);

  return {
    inputValue,
    onChange,
    onBlur,
    onKeyDown,
    blurTriggeredByEscapeKey,
    restoreFocusAfterKeyboardSubmit,
  };
}
