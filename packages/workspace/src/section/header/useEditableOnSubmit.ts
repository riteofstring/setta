import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

// The reference's `state/hooks/editableText.ts`: commit on blur or Enter when the normalized
// value is non-empty, changed, and accepted by the condition; Escape reverts.
export function useEditableOnSubmit(
  initialValue: string,
  onSetTitle: (x: string) => void,
  condition: (x: string) => boolean,
  normalize: (x: string) => string = (x) => x,
) {
  const [inputValue, setInputValue] = useState(initialValue);
  const blurTriggeredByEscapeKey = useRef(false);
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
    if (event.code === "Escape") {
      blurTriggeredByEscapeKey.current = true;
      event.currentTarget.blur();
      latestValueRef.current = initialValue;
      setInputValue(initialValue);
    } else if (event.code === "Enter") {
      event.currentTarget.blur();
    }
  }

  useEffect(() => {
    latestValueRef.current = initialValue;
    setInputValue(initialValue);
  }, [initialValue]);

  return { inputValue, onChange, onBlur, onKeyDown, blurTriggeredByEscapeKey };
}
